import type { Request, Response } from 'express';
import {
  submitPayment,
  getPaymentById,
  listPaymentsForAdmin,
  verifyPaymentByAdmin,
} from './payment.service.js';
import type {
  SubmitPaymentInput,
  GetPaymentParams,
  AdminListPaymentsQuery,
  AdminVerifyPaymentBody,
} from './payment.validation.js';

export async function handleSubmitPayment(
  req: Request<unknown, unknown, SubmitPaymentInput>,
  res: Response,
): Promise<void> {
  const payment = await submitPayment(req.body, {
    customerId: req.customerId,
    orderToken: req.orderToken,
  });

  res.status(201).json({
    success: true,
    data: payment,
    message:
      'Payment submitted. An administrator will verify this transaction manually.',
  });
}

export async function handleGetPayment(
  req: Request<GetPaymentParams>,
  res: Response,
): Promise<void> {
  const payment = await getPaymentById(req.params.id, {
    customerId: req.customerId,
    orderToken: req.orderToken,
  });

  res.status(200).json({
    success: true,
    data: payment,
  });
}

export async function handleAdminListPayments(
  req: Request<unknown, unknown, unknown, AdminListPaymentsQuery>,
  res: Response,
): Promise<void> {
  const statusFilter =
    req.query.status === 'pending' ||
    req.query.status === 'verified' ||
    req.query.status === 'rejected'
      ? req.query.status
      : undefined;

  const payments = await listPaymentsForAdmin({ status: statusFilter });

  res.status(200).json({
    success: true,
    data: payments,
  });
}

export async function handleAdminVerifyPayment(
  req: Request<GetPaymentParams, unknown, AdminVerifyPaymentBody>,
  res: Response,
): Promise<void> {
  const adminId = req.admin?.id ?? 'admin';
  const result = await verifyPaymentByAdmin(req.params.id, req.body, adminId);

  res.status(200).json({
    success: true,
    data: result,
    message:
      result.status === 'verified'
        ? 'Payment verified and order marked as paid.'
        : 'Payment rejected.',
  });
}
