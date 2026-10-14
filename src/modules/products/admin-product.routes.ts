import { Router, type IRouter } from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  updateProductParamsSchema,
  updateProductBodySchema,
  createProductBodySchema,
} from './product.validation.js';
import {
  getProductsHandler,
  adminCreateProductHandler,
  adminUpdateProductHandler,
  adminDeleteProductHandler,
} from './product.controller.js';

const router: IRouter = Router();

router.use(requireAdmin);

/**
 * GET /api/v1/admin/products
 * Lists all products for admin management.
 */
router.get('/', getProductsHandler);

/**
 * POST /api/v1/admin/products
 * Creates a new product.
 */
router.post(
  '/',
  validateRequest({
    body: createProductBodySchema,
  }),
  adminCreateProductHandler,
);

/**
 * PATCH /api/v1/admin/products/:id
 * Updates product fields.
 */
router.patch(
  '/:id',
  validateRequest({
    params: updateProductParamsSchema,
    body: updateProductBodySchema,
  }),
  adminUpdateProductHandler,
);

/**
 * PUT /api/v1/admin/products/:id
 * Full product edit.
 */
router.put(
  '/:id',
  validateRequest({
    params: updateProductParamsSchema,
    body: updateProductBodySchema,
  }),
  adminUpdateProductHandler,
);

/**
 * DELETE /api/v1/admin/products/:id
 * Safely removes product or marks inactive if historical orders exist.
 */
router.delete(
  '/:id',
  validateRequest({
    params: updateProductParamsSchema,
  }),
  adminDeleteProductHandler,
);

export { router as adminProductRoutes };

