import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/api-error.js';
import { verifyOrderOwnership } from '../orders/order.service.js';
import type {
  SubmitPaymentInput,
  AdminListPaymentsQuery,
  AdminVerifyPaymentBody,
} from './payment.validation.js';

/**
 * MANUAL BKASH PAYMENT — SECURITY & WORKFLOW NOTES:
 *
 * 1. Never trust client-supplied amounts:
 *    The client only submits `transactionId` (plus `orderId` and ownership credentials).
 *    The server determines the payable amount from the trusted `Order` record on the server.
 *
 * 2. Never auto-verify on submission:
 *    Submitting a transaction ID always creates the record with `status: 'pending'`
 *    and `method: 'manual_bkash'`. An authorized administrator must manually
 *    verify the transaction against the merchant bKash account statement before
 *    transitioning the status to `'verified'` or `'rejected'`.
 *
 * 3. No sensitive bKash credentials:
 *    This service never asks for, stores, or logs any bKash PIN, OTP, password,
 *    or secret credentials.
 */

export function resolveServerSideAmount(): Prisma.Decimal {
  // Foundation default amount in BDT when no order is attached.
  return new Prisma.Decimal('0.00');
}

export interface CustomerAuthContext {
  customerId?: string;
  orderToken?: string;
}

export async function submitPayment(
  input: SubmitPaymentInput,
  auth?: CustomerAuthContext,
) {
  const normalizedTrxId = input.transactionId.trim().toUpperCase();

  // Pre-check for duplicate transaction ID
  const existing = await prisma.payment.findUnique({
    where: { transactionId: normalizedTrxId },
  });

  if (existing) {
    throw ApiError.conflict(
      'A payment with this transaction ID has already been submitted',
    );
  }

  // If linked to an Order, validate order existence, ownership, state, and authoritative amount
  if (input.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw ApiError.notFound('Order not found');
    }

    verifyOrderOwnership(order, {
      customerId: auth?.customerId ?? input.customerId,
      orderToken: auth?.orderToken ?? input.orderToken,
    });

    if (order.status === 'paid') {
      throw ApiError.conflict('This order has already been paid and verified');
    }

    const activePayment = order.payments?.find(
      (p) => p.status === 'pending' || p.status === 'verified',
    );
    if (activePayment || order.status === 'payment_submitted') {
      throw ApiError.conflict(
        'A payment for this order has already been submitted and is awaiting verification',
      );
    }

    try {
      const executeOrderPayment = async (tx: typeof prisma) => {
        const createdPayment = await tx.payment.create({
          data: {
            orderId: order.id,
            customerId: order.customerId,
            amount: order.amount,
            currency: 'BDT',
            transactionId: normalizedTrxId,
            method: 'manual_bkash',
            status: 'pending',
            payerPhone: input.payerPhone ?? order.customerPhone ?? null,
          },
        });

        const updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'payment_submitted',
          },
        });

        return { createdPayment, updatedOrder };
      };

      const { createdPayment, updatedOrder } =
        typeof prisma.$transaction === 'function'
          ? await prisma.$transaction(async (tx) =>
              executeOrderPayment(tx as unknown as typeof prisma),
            )
          : await executeOrderPayment(prisma);

      return {
        id: createdPayment.id,
        orderId: createdPayment.orderId,
        customerId: createdPayment.customerId,
        amount: createdPayment.amount.toFixed(2),
        currency: createdPayment.currency,
        transactionId: createdPayment.transactionId,
        method: createdPayment.method,
        status: createdPayment.status,
        orderStatus: updatedOrder.status,
        createdAt: createdPayment.createdAt,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw ApiError.conflict(
          'A payment with this transaction ID has already been submitted',
        );
      }
      throw error;
    }
  }

  // Standalone payment fallback (preserves foundational API behavior)
  try {
    const payment = await prisma.payment.create({
      data: {
        amount: resolveServerSideAmount(),
        currency: 'BDT',
        transactionId: normalizedTrxId,
        method: 'manual_bkash',
        status: 'pending',
        payerPhone: input.payerPhone ?? null,
      },
    });

    return {
      id: payment.id,
      orderId: payment.orderId ?? null,
      amount: payment.amount.toFixed(2),
      currency: payment.currency,
      transactionId: payment.transactionId,
      method: payment.method,
      status: payment.status,
      createdAt: payment.createdAt,
    };
  } catch (error) {
    // Handle concurrent duplicate insert via unique constraint (P2002)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw ApiError.conflict(
        'A payment with this transaction ID has already been submitted',
      );
    }
    throw error;
  }
}

export async function getPaymentById(id: string, auth?: CustomerAuthContext) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      order: true,
    },
  });

  if (!payment) {
    throw ApiError.notFound('Payment not found');
  }

  if (payment.order) {
    verifyOrderOwnership(payment.order, {
      customerId: auth?.customerId,
      orderToken: auth?.orderToken,
    });
  }

  return {
    id: payment.id,
    orderId: payment.orderId ?? null,
    amount: payment.amount.toFixed(2),
    currency: payment.currency,
    transactionId: payment.transactionId,
    method: payment.method,
    status: payment.status,
    rejectionReason: payment.rejectionReason ?? null,
    verifiedAt: payment.verifiedAt ?? null,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

export async function listPaymentsForAdmin(query: AdminListPaymentsQuery) {
  const where = query.status ? { status: query.status } : {};

  const payments = await prisma.payment.findMany({
    where,
    include: {
      order: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return payments.map((p) => ({
    id: p.id,
    orderId: p.orderId,
    customerId: p.customerId,
    amount: p.amount.toFixed(2),
    currency: p.currency,
    transactionId: p.transactionId,
    method: p.method,
    status: p.status,
    payerPhone: p.payerPhone,
    adminNote: p.adminNote,
    rejectionReason: p.rejectionReason,
    verifiedBy: p.verifiedBy,
    verifiedAt: p.verifiedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    order: p.order
      ? {
          id: p.order.id,
          customerId: p.order.customerId,
          customerEmail: p.order.customerEmail,
          customerPhone: p.order.customerPhone,
          customerNote: p.order.customerNote,
          productId: p.order.productId,
          productName: p.order.productName,
          planName: p.order.planName,
          amount: p.order.amount.toFixed(2),
          currency: p.order.currency,
          status: p.order.status,
          paidAt: p.order.paidAt,
          createdAt: p.order.createdAt,
        }
      : null,
  }));
}

export async function verifyPaymentByAdmin(
  paymentId: string,
  input: AdminVerifyPaymentBody,
  adminId: string,
) {
  const existing = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: true },
  });

  if (!existing) {
    throw ApiError.notFound('Payment not found');
  }

  if (existing.status === 'verified') {
    throw ApiError.conflict(
      'Payment has already been verified and cannot be modified',
    );
  }

  const now = new Date();
  const isVerified = input.status === 'verified';

  const executeVerification = async (tx: typeof prisma) => {
    const updatedPayment = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: input.status,
        verifiedBy: adminId,
        verifiedAt: now,
        rejectionReason: isVerified ? null : (input.rejectionReason ?? null),
        adminNote: input.adminNote ?? null,
      },
    });

    let updatedOrder = null;
    if (existing.orderId) {
      updatedOrder = await tx.order.update({
        where: { id: existing.orderId },
        data: {
          status: isVerified ? 'paid' : 'rejected',
          paidAt: isVerified ? now : null,
        },
      });
    }

    return { updatedPayment, updatedOrder };
  };

  const { updatedPayment, updatedOrder } =
    typeof prisma.$transaction === 'function'
      ? await prisma.$transaction(async (tx) =>
          executeVerification(tx as unknown as typeof prisma),
        )
      : await executeVerification(prisma);

  // Structured audit log for verification action (never logs secrets)
  if (env.NODE_ENV !== 'test' || env.LOG_LEVEL === 'debug') {
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'payment_verification_decision',
        paymentId: updatedPayment.id,
        orderId: updatedPayment.orderId,
        transactionId: updatedPayment.transactionId,
        decision: updatedPayment.status,
        orderStatus: updatedOrder?.status ?? null,
        verifiedBy: adminId,
        verifiedAt: now.toISOString(),
      }),
    );
  }

  return {
    id: updatedPayment.id,
    orderId: updatedPayment.orderId,
    customerId: updatedPayment.customerId,
    amount: updatedPayment.amount.toFixed(2),
    currency: updatedPayment.currency,
    transactionId: updatedPayment.transactionId,
    method: updatedPayment.method,
    status: updatedPayment.status,
    rejectionReason: updatedPayment.rejectionReason,
    adminNote: updatedPayment.adminNote,
    verifiedBy: updatedPayment.verifiedBy,
    verifiedAt: updatedPayment.verifiedAt,
    createdAt: updatedPayment.createdAt,
    updatedAt: updatedPayment.updatedAt,
    order: updatedOrder
      ? {
          id: updatedOrder.id,
          status: updatedOrder.status,
          paidAt: updatedOrder.paidAt,
        }
      : null,
  };
}
