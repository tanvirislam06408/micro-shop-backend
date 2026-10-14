import { randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { sendOrderTelegramNotification } from '../../lib/telegram.js';
import { resolveLiveProductForOrder } from '../products/product.service.js';
import { ApiError } from '../../utils/api-error.js';
import { safeCompareStrings } from '../../middleware/auth.js';
import type {
  CreateOrderInput,
  AdminListOrdersQuery,
  AdminUpdateOrderStatusInput,
} from './order.validation.js';


export type ManualPaymentMethod = 'manual_bkash' | 'manual_nagad';

export interface PublicMerchantConfig {
  merchantName: string;
  merchantNumber: string;
  bkashNumber: string;
  nagadNumber: string;
  merchantLogoUrl: string;
  currency: 'BDT';
  method: ManualPaymentMethod;
  dialCode: '*247#' | '*167#';
}

export function getPublicMerchantConfig(
  method: ManualPaymentMethod = 'manual_bkash',
): PublicMerchantConfig {
  const isNagad = method === 'manual_nagad';
  return {
    merchantName: env.MERCHANT_NAME,
    merchantNumber: isNagad ? env.NAGAD_MERCHANT_NUMBER : env.BKASH_MERCHANT_NUMBER,
    bkashNumber: env.BKASH_MERCHANT_NUMBER,
    nagadNumber: env.NAGAD_MERCHANT_NUMBER,
    merchantLogoUrl: env.MERCHANT_LOGO_URL,
    currency: 'BDT',
    method,
    dialCode: isNagad ? '*167#' : '*247#',
  };
}

export function verifyOrderOwnership(
  order: { customerId: string; orderToken: string },
  auth: { customerId?: string; orderToken?: string },
): void {
  const tokenMatches =
    Boolean(auth.orderToken) &&
    safeCompareStrings(auth.orderToken!, order.orderToken);
  const customerMatches =
    Boolean(auth.customerId) &&
    safeCompareStrings(auth.customerId!, order.customerId);

  if (!tokenMatches && !customerMatches) {
    throw ApiError.forbidden('You do not have permission to access this order');
  }
}

export async function createOrder(
  input: CreateOrderInput,
  headerCustomerId?: string,
) {
  const pricing = await resolveLiveProductForOrder(
    input.productId,
    input.planName,
  );
  const customerId =
    headerCustomerId || input.customerId || `cust_${randomUUID()}`;
  const orderToken = randomBytes(24).toString('hex');
  const paymentMethod: ManualPaymentMethod =
    input.paymentMethod ?? 'manual_bkash';

  const normalizedPhone = input.customerPhone.replace(/^\+?88/, '');

  const order = await prisma.order.create({
    data: {
      customerId,
      orderToken,
      customerEmail: input.customerEmail.toLowerCase(),
      customerPhone: normalizedPhone,
      customerNote: input.customerNote ?? null,
      productId: pricing.productId,
      productName: pricing.productName,
      planName: pricing.planName,
      amount: pricing.amount,
      currency: pricing.currency,
      paymentMethod,
      status: 'pending_payment',
    },
  });

  const resolvedMethod: ManualPaymentMethod =
    order.paymentMethod === 'manual_nagad' ? 'manual_nagad' : paymentMethod;
  const formattedAmount = order.amount.toFixed(2);

  try {
    await sendOrderTelegramNotification({
      id: order.id,
      customerId: order.customerId,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      customerNote: order.customerNote,
      productId: order.productId,
      productName: order.productName,
      planName: order.planName,
      amount: formattedAmount,
      currency: order.currency,
      paymentMethod: resolvedMethod,
      status: order.status,
      createdAt: order.createdAt,
    });
  } catch {
    // Notification errors are already logged inside sendOrderTelegramNotification
    // and must never interrupt the customer order response.
  }

  return {
    id: order.id,
    customerId: order.customerId,
    orderToken: order.orderToken,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    customerNote: order.customerNote,
    productId: order.productId,
    productName: order.productName,
    planName: order.planName,
    amount: formattedAmount,
    currency: order.currency,
    paymentMethod: resolvedMethod,
    status: order.status,
    createdAt: order.createdAt,
    merchant: getPublicMerchantConfig(resolvedMethod),
  };
}

export async function getOrderForCustomer(
  orderId: string,
  auth: { customerId?: string; orderToken?: string },
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!order) {
    throw ApiError.notFound('Order not found');
  }

  verifyOrderOwnership(order, auth);

  const latestPayment = order.payments?.[0] ?? null;
  const resolvedMethod: ManualPaymentMethod =
    latestPayment?.method === 'manual_nagad' ||
    order.paymentMethod === 'manual_nagad'
      ? 'manual_nagad'
      : 'manual_bkash';

  return {
    id: order.id,
    customerId: order.customerId,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    customerNote: order.customerNote,
    productId: order.productId,
    productName: order.productName,
    planName: order.planName,
    amount: order.amount.toFixed(2),
    currency: order.currency,
    paymentMethod: resolvedMethod,
    status: order.status,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    payment: latestPayment
      ? {
          id: latestPayment.id,
          transactionId: latestPayment.transactionId,
          method: latestPayment.method,
          amount: latestPayment.amount.toFixed(2),
          currency: latestPayment.currency,
          status: latestPayment.status,
          rejectionReason: latestPayment.rejectionReason ?? null,
          verifiedAt: latestPayment.verifiedAt ?? null,
          createdAt: latestPayment.createdAt,
        }
      : null,
    merchant: getPublicMerchantConfig(resolvedMethod),
  };
}

export async function listOrdersForAdmin(query: AdminListOrdersQuery) {
  const where: Prisma.OrderWhereInput = {};

  if (query.status) {
    where.status = query.status;
  }

  if (query.paymentStatus) {
    where.payments = {
      some: {
        status: query.paymentStatus,
      },
    };
  }

  if (query.search) {
    const s = query.search.trim();
    where.OR = [
      { id: { contains: s, mode: 'insensitive' } },
      { customerEmail: { contains: s, mode: 'insensitive' } },
      { customerPhone: { contains: s, mode: 'insensitive' } },
      { productName: { contains: s, mode: 'insensitive' } },
      {
        payments: {
          some: {
            transactionId: { contains: s, mode: 'insensitive' },
          },
        },
      },
    ];
  }

  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const limit =
    Number(query.limit) > 0 && Number(query.limit) <= 100
      ? Number(query.limit)
      : 20;
  const skip = (page - 1) * limit;

  const sortBy = query.sortBy === 'amount' ? 'amount' : 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
  ]);


  const formattedOrders = orders.map((o) => ({
    id: o.id,
    customerId: o.customerId,
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    customerNote: o.customerNote,
    productId: o.productId,
    productName: o.productName,
    planName: o.planName,
    amount: o.amount.toFixed(2),
    currency: o.currency,
    paymentMethod: o.paymentMethod,
    status: o.status,
    paidAt: o.paidAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    payments: o.payments.map((p) => ({
      id: p.id,
      transactionId: p.transactionId,
      amount: p.amount.toFixed(2),
      status: p.status,
      method: p.method,
      payerPhone: p.payerPhone,
      adminNote: p.adminNote,
      rejectionReason: p.rejectionReason,
      verifiedBy: p.verifiedBy,
      verifiedAt: p.verifiedAt,
      createdAt: p.createdAt,
    })),
  }));

  return {
    orders: formattedOrders,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getOrderDetailsForAdmin(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payments: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!order) {
    throw ApiError.notFound(`Order not found: ${orderId}`);
  }

  return {
    id: order.id,
    customerId: order.customerId,
    orderToken: order.orderToken,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    customerNote: order.customerNote,
    productId: order.productId,
    productName: order.productName,
    planName: order.planName,
    amount: order.amount.toFixed(2),
    currency: order.currency,
    paymentMethod: order.paymentMethod,
    status: order.status,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    payments: order.payments.map((p) => ({
      id: p.id,
      transactionId: p.transactionId,
      amount: p.amount.toFixed(2),
      status: p.status,
      method: p.method,
      payerPhone: p.payerPhone,
      adminNote: p.adminNote,
      rejectionReason: p.rejectionReason,
      verifiedBy: p.verifiedBy,
      verifiedAt: p.verifiedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  };
}

export async function updateOrderStatusByAdmin(
  orderId: string,
  input: AdminUpdateOrderStatusInput,
  adminActor: string,
) {
  const existingOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: true },
  });

  if (!existingOrder) {
    throw ApiError.notFound(`Order not found: ${orderId}`);
  }

  const updateData: Prisma.OrderUpdateInput = {
    status: input.status,
  };

  if (input.status === 'paid' && !existingOrder.paidAt) {
    updateData.paidAt = new Date();
  }

  // Update order in transaction
  const updatedOrder = await prisma.$transaction(async (tx) => {
    const res = await tx.order.update({
      where: { id: orderId },
      data: updateData,
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // If order was explicitly rejected or cancelled, mark pending payments as rejected
    if (input.status === 'rejected') {
      await tx.payment.updateMany({
        where: {
          orderId,
          status: 'pending',
        },
        data: {
          status: 'rejected',
          rejectionReason: input.adminNote || 'Order rejected by administrator',
          verifiedBy: adminActor,
          verifiedAt: new Date(),
        },
      });
    }

    return res;
  });

  return {
    id: updatedOrder.id,
    status: updatedOrder.status,
    paidAt: updatedOrder.paidAt,
    updatedAt: updatedOrder.updatedAt,
    adminActor,
  };
}

