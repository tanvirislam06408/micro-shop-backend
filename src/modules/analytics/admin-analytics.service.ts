import { prisma } from '../../lib/prisma.js';

export interface DailyTrendItem {
  date: string;
  orders: number;
  revenue: number;
}

export interface AnalyticsOverview {
  totalOrders: number;
  totalRevenue: number;
  totalPayments: number;
  pendingPayments: number;
  rejectedPayments: number;
  paidOrders: number;
  pendingOrders: number;
  rejectedOrders: number;
  totalProducts: number;
  outOfStockProducts: number;
  todayOrders: number;
  todayRevenue: number;
}

export interface AnalyticsResponse {
  overview: AnalyticsOverview;
  orderStatusDistribution: Record<string, number>;
  paymentStatusDistribution: Record<string, number>;
  dailyTrends: DailyTrendItem[];
  recentOrders: Array<{
    id: string;
    customerId: string;
    customerEmail: string;
    customerPhone: string;
    productId: string;
    productName: string;
    planName: string;
    amount: string;
    currency: string;
    status: string;
    paymentMethod: string;
    createdAt: Date;
    payments: Array<{
      id: string;
      transactionId: string;
      status: string;
      amount: string;
    }>;
  }>;
  topSellingProducts: Array<{
    productId: string;
    productName: string;
    ordersCount: number;
    totalRevenue: number;
  }>;
}

export async function getAdminAnalytics(days = 14): Promise<AnalyticsResponse> {
  const now = new Date();

  // Start of today in Asia/Dhaka (UTC+6)
  const dhakaOffsetMs = 6 * 60 * 60 * 1000;
  const dhakaNow = new Date(now.getTime() + dhakaOffsetMs);
  const dhakaTodayStartUtc = new Date(
    Date.UTC(
      dhakaNow.getUTCFullYear(),
      dhakaNow.getUTCMonth(),
      dhakaNow.getUTCDate(),
      0,
      0,
      0,
      0,
    ) - dhakaOffsetMs,
  );

  // Queries executed in parallel
  const [
    totalOrders,
    paidOrders,
    pendingPaymentOrders,
    submittedOrders,
    rejectedOrders,
    todayOrders,
    paymentStats,
    todayVerifiedPayments,
    productsStats,
    recentOrders,
    allOrdersForTrends,
    allVerifiedPaymentsForTrends,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: 'paid' } }),
    prisma.order.count({ where: { status: 'pending_payment' } }),
    prisma.order.count({ where: { status: 'payment_submitted' } }),
    prisma.order.count({ where: { status: 'rejected' } }),
    prisma.order.count({ where: { createdAt: { gte: dhakaTodayStartUtc } } }),

    // Payment aggregations
    Promise.all([
      prisma.payment.count({ where: { status: 'verified' } }),
      prisma.payment.count({ where: { status: 'pending' } }),
      prisma.payment.count({ where: { status: 'rejected' } }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: 'verified' },
      }),
    ]),

    // Today's verified payments sum (based on approval time, with fallback to createdAt)
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: 'verified',
        OR: [
          { verifiedAt: { gte: dhakaTodayStartUtc } },
          { verifiedAt: null, createdAt: { gte: dhakaTodayStartUtc } },
        ],
      },
    }),

    // Products in stock vs out
    Promise.all([
      prisma.product.count({ where: { inStock: true } }),
      prisma.product.count({ where: { inStock: false } }),
    ]),

    // Recent orders
    prisma.order.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: {
        payments: {
          select: {
            id: true,
            transactionId: true,
            status: true,
            amount: true,
          },
        },
      },
    }),

    // Trend queries: orders within the window
    prisma.order.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        id: true,
        productId: true,
        productName: true,
        amount: true,
        status: true,
        createdAt: true,
      },
    }),

    // Verified payments within the window (based on approval time)
    prisma.payment.findMany({
      where: {
        status: 'verified',
        OR: [
          {
            verifiedAt: {
              gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
            },
          },
          {
            verifiedAt: null,
            createdAt: {
              gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
            },
          },
        ],
      },
      select: {
        amount: true,
        verifiedAt: true,
        createdAt: true,
      },
    }),
  ]);

  const [verifiedPaymentsCount, pendingPaymentsCount, rejectedPaymentsCount, verifiedSum] =
    paymentStats;
  const [inStockCount, outOfStockCount] = productsStats;

  const totalRevenueNum = Number(verifiedSum._sum.amount ?? 0);
  const todayRevenueNum = Number(todayVerifiedPayments._sum.amount ?? 0);

  // Group daily trends
  const trendMap = new Map<string, { orders: number; revenue: number }>();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateKey = d.toISOString().slice(0, 10);
    trendMap.set(dateKey, { orders: 0, revenue: 0 });
  }

  for (const ord of allOrdersForTrends) {
    const key = ord.createdAt.toISOString().slice(0, 10);
    if (trendMap.has(key)) {
      trendMap.get(key)!.orders += 1;
    }
  }

  for (const pay of allVerifiedPaymentsForTrends) {
    const targetDate = pay.verifiedAt || pay.createdAt;
    const key = targetDate.toISOString().slice(0, 10);
    if (trendMap.has(key)) {
      trendMap.get(key)!.revenue += Number(pay.amount);
    }
  }

  const dailyTrends: DailyTrendItem[] = Array.from(trendMap.entries()).map(
    ([date, data]) => ({
      date,
      orders: data.orders,
      revenue: Math.round(data.revenue * 100) / 100,
    }),
  );

  // Top selling products (from paid orders)
  const productSalesMap = new Map<
    string,
    { productId: string; productName: string; ordersCount: number; totalRevenue: number }
  >();

  for (const ord of allOrdersForTrends) {
    if (ord.status === 'paid') {
      const existing = productSalesMap.get(ord.productId) || {
        productId: ord.productId,
        productName: ord.productName,
        ordersCount: 0,
        totalRevenue: 0,
      };
      existing.ordersCount += 1;
      existing.totalRevenue += Number(ord.amount);
      productSalesMap.set(ord.productId, existing);
    }
  }

  const topSellingProducts = Array.from(productSalesMap.values()).sort(
    (a, b) => b.totalRevenue - a.totalRevenue,
  );

  return {
    overview: {
      totalOrders,
      totalRevenue: totalRevenueNum,
      totalPayments: verifiedPaymentsCount,
      pendingPayments: pendingPaymentsCount,
      rejectedPayments: rejectedPaymentsCount,
      paidOrders,
      pendingOrders: pendingPaymentOrders + submittedOrders,
      rejectedOrders,
      totalProducts: inStockCount,
      outOfStockProducts: outOfStockCount,
      todayOrders,
      todayRevenue: todayRevenueNum,
    },
    orderStatusDistribution: {
      pending_payment: pendingPaymentOrders,
      payment_submitted: submittedOrders,
      paid: paidOrders,
      rejected: rejectedOrders,
    },
    paymentStatusDistribution: {
      pending: pendingPaymentsCount,
      verified: verifiedPaymentsCount,
      rejected: rejectedPaymentsCount,
    },
    dailyTrends,
    recentOrders: recentOrders.map((ro) => ({
      id: ro.id,
      customerId: ro.customerId,
      customerEmail: ro.customerEmail,
      customerPhone: ro.customerPhone,
      productId: ro.productId,
      productName: ro.productName,
      planName: ro.planName,
      amount: ro.amount.toFixed(2),
      currency: ro.currency,
      status: ro.status,
      paymentMethod: ro.paymentMethod,
      createdAt: ro.createdAt,
      payments: ro.payments.map((p) => ({
        id: p.id,
        transactionId: p.transactionId,
        status: p.status,
        amount: p.amount.toFixed(2),
      })),
    })),
    topSellingProducts,
  };
}
