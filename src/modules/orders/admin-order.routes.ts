import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  adminListOrdersQuerySchema,
  getOrderParamsSchema,
  adminUpdateOrderStatusSchema,
} from './order.validation.js';
import {
  handleAdminListOrders,
  handleAdminGetOrderDetails,
  handleAdminUpdateOrderStatus,
} from './admin-order.controller.js';

const router: Router = Router();

router.use(requireAdmin);

router.get(
  '/',
  validateRequest({ query: adminListOrdersQuerySchema }),
  handleAdminListOrders,
);

router.get(
  '/:id',
  validateRequest({ params: getOrderParamsSchema }),
  handleAdminGetOrderDetails,
);

router.patch(
  '/:id/status',
  validateRequest({
    params: getOrderParamsSchema,
    body: adminUpdateOrderStatusSchema,
  }),
  handleAdminUpdateOrderStatus,
);

export { router as adminOrderRoutes };
