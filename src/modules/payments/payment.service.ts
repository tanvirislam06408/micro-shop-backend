import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import type { SubmitPaymentInput } from './payment.validation.js';

/**
 * MANUAL BKASH PAYMENT FOUNDATION — SECURITY & WORKFLOW NOTES:
 *
 * 1. Never trust client-supplied amounts:
 *    The client only submits `transactionId` (and optional `payerPhone`).
 *    The server determines the payable amount from an authoritative server-side
 *    source (resolved via `resolveServerSideAmount`).
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
  // Foundation default amount in BDT until a pricing/order module is attached.
  return new Prisma.Decimal('0.00');
}

export async function submitPayment(input: SubmitPaymentInput) {
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

export async function getPaymentById(id: string) {
  const payment = await prisma.payment.findUnique({
    where: { id },
  });

  if (!payment) {
    throw ApiError.notFound('Payment not found');
  }

  return {
    id: payment.id,
    amount: payment.amount.toFixed(2),
    currency: payment.currency,
    transactionId: payment.transactionId,
    method: payment.method,
    status: payment.status,
    payerPhone: payment.payerPhone,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}
