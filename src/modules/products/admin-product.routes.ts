import { Router, type IRouter } from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  updateProductParamsSchema,
  updateProductBodySchema,
} from './product.validation.js';
import {
  getProductsHandler,
  adminUpdateProductHandler,
} from './product.controller.js';

const router: IRouter = Router();

router.use(requireAdmin);

/**
 * GET /api/v1/admin/products
 * Lists all products for admin management.
 */
router.get('/', getProductsHandler);

/**
 * PATCH /api/v1/admin/products/:id
 * Updates product stock status (inStock boolean), price (amountBdt), or description.
 */
router.patch(
  '/:id',
  validateRequest({
    params: updateProductParamsSchema,
    body: updateProductBodySchema,
  }),
  adminUpdateProductHandler,
);

export { router as adminProductRoutes };
