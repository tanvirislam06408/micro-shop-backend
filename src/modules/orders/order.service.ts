import { randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { sendOrderTelegramNotification } from '../../lib/telegram.js';
import { resolveLiveProductForOrder } from '../products/product.service.js';
import { ApiError } from '../../utils/api-error.js';
import { safeCompareStrings } from '../../middleware/auth.js';
import type { CreateOrderInput } from './order.validation.js';

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
