import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod/v4';
import { ApiError } from '../utils/api-error.js';

interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export function validateRequest(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        throw ApiError.badRequest(
          `Validation failed: ${result.error.issues.map((i) => i.message).join(', ')}`,
        );
      }
      req.body = result.data;
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        throw ApiError.badRequest(
          `Query validation failed: ${result.error.issues.map((i) => i.message).join(', ')}`,
        );
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        throw ApiError.badRequest(
          `Params validation failed: ${result.error.issues.map((i) => i.message).join(', ')}`,
        );
      }
    }

    next();
  };
}
