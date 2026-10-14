import type { Request, Response, NextFunction } from 'express';
import {
  listProducts,
  updateProductByAdmin,
  createProductByAdmin,
  deleteProductByAdmin,
} from './product.service.js';
import type {
  UpdateProductParams,
  UpdateProductBody,
  CreateProductBody,
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

export async function adminCreateProductHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as CreateProductBody;
    const created = await createProductByAdmin(body);

    res.status(201).json({
      success: true,
      data: created,
      message: 'Product created successfully',
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
      message: 'Product updated successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function adminDeleteProductHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as UpdateProductParams;
    const result = await deleteProductByAdmin(id);

    res.status(200).json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
}

