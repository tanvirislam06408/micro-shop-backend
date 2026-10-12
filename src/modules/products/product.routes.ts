import { Router, type IRouter } from 'express';
import { getProductsHandler } from './product.controller.js';

const router: IRouter = Router();

/**
 * GET /api/v1/products
 * Public endpoint returning live product catalog (pricing, description, stock status).
 */
router.get('/', getProductsHandler);

export { router as productRoutes };
