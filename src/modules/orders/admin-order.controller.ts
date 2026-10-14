import type { Request, Response } from 'express';
import {
  listOrdersForAdmin,
  getOrderDetailsForAdmin,
  updateOrderStatusByAdmin,
} from './order.service.js';
import type {
  AdminListOrdersQuery,
  AdminUpdateOrderStatusInput,
  GetOrderParams,
} from './order.validation.js';

export async function handleAdminListOrders(
  req: Request,
  res: Response,
): Promise<void> {
  const query = req.query as unknown as AdminListOrdersQuery;
  const result = await listOrdersForAdmin(query);

  res.status(200).json({
    success: true,
    data: result.orders,
    pagination: result.pagination,
  });
}


export async function handleAdminGetOrderDetails(
  req: Request<GetOrderParams>,
  res: Response,
): Promise<void> {
  const order = await getOrderDetailsForAdmin(req.params.id);

  res.status(200).json({
    success: true,
    data: order,
  });
}

export async function handleAdminUpdateOrderStatus(
  req: Request<GetOrderParams, unknown, AdminUpdateOrderStatusInput>,
  res: Response,
): Promise<void> {
  const adminActor = req.admin?.id || 'admin';
  const updated = await updateOrderStatusByAdmin(req.params.id, req.body, adminActor);

  res.status(200).json({
    success: true,
    data: updated,
    message: `Order status updated to ${updated.status}`,
  });
}
