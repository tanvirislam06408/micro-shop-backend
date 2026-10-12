import type { Request, Response, NextFunction } from 'express';
import { listProducts, updateProductByAdmin } from './product.service.js';
import type {
  UpdateProductParams,
  UpdateProductBody,
} from './product.validation.js';

export async function getProductsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const products = await listProducts();
    res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminUpdateProductHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as UpdateProductParams;
    const body = req.body as UpdateProductBody;
    const updated = await updateProductByAdmin(id, body);

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}
