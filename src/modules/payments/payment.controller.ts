import type { Request, Response } from 'express';
import { submitPayment, getPaymentById } from './payment.service.js';
import type { SubmitPaymentInput, GetPaymentParams } from './payment.validation.js';

export async function handleSubmitPayment(
  req: Request<unknown, unknown, SubmitPaymentInput>,
  res: Response,
): Promise<void> {
  const payment = await submitPayment(req.body);

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
  const payment = await getPaymentById(req.params.id);

  res.status(200).json({
    success: true,
    data: payment,
  });
}
