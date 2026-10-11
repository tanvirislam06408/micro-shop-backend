import { Router } from 'express';
import {
  handleCreateOrder,
  handleGetOrder,
  handleGetMerchantConfig,
} from './order.controller.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { strictLimiter } from '../../middleware/rate-limit.js';
import { extractCustomerContext } from '../../middleware/auth.js';
import {
  createOrderSchema,
  getOrderParamsSchema,
} from './order.validation.js';

const router: Router = Router();

router.get('/merchant-config', handleGetMerchantConfig);

router.post(
  '/',
  strictLimiter,
  extractCustomerContext,
  validateRequest({ body: createOrderSchema }),
  handleCreateOrder,
);

router.get(
  '/:id',
  extractCustomerContext,
  validateRequest({ params: getOrderParamsSchema }),
  handleGetOrder,
);

export { router as orderRoutes };
