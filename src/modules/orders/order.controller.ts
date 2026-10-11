import type { Request, Response } from 'express';
import {
  createOrder,
  getOrderForCustomer,
  getPublicMerchantConfig,
} from './order.service.js';
import type { CreateOrderInput, GetOrderParams } from './order.validation.js';

export async function handleCreateOrder(
  req: Request<unknown, unknown, CreateOrderInput>,
  res: Response,
): Promise<void> {
  const order = await createOrder(req.body, req.customerId);

  res.status(201).json({
    success: true,
    data: order,
    message: 'Order created. Please complete manual bKash payment.',
  });
}

export async function handleGetOrder(
  req: Request<GetOrderParams>,
  res: Response,
): Promise<void> {
  const order = await getOrderForCustomer(req.params.id, {
    customerId: req.customerId,
    orderToken: req.orderToken,
  });

  res.status(200).json({
    success: true,
    data: order,
  });
}

export function handleGetMerchantConfig(
  _req: Request,
  res: Response,
): void {
  res.status(200).json({
    success: true,
    data: getPublicMerchantConfig(),
  });
}
