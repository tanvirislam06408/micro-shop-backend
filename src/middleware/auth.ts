import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { ApiError } from '../utils/api-error.js';

export interface AdminContext {
  id: string;
  role: 'admin';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminContext;
      customerId?: string;
      orderToken?: string;
    }
  }
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 */
export function safeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Server-side middleware that protects admin endpoints.
 * Accepts `X-Admin-Key: <key>` or `Authorization: Bearer <key>`.
 */
export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const headerKey = req.headers['x-admin-key'];
  const authHeader = req.headers.authorization;

  let providedKey: string | undefined;

  if (typeof headerKey === 'string' && headerKey.trim().length > 0) {
    providedKey = headerKey.trim();
  } else if (
    typeof authHeader === 'string' &&
    authHeader.toLowerCase().startsWith('bearer ')
  ) {
    providedKey = authHeader.slice(7).trim();
  }

  if (!providedKey) {
    throw ApiError.unauthorized('Admin authentication credentials are required');
  }

  if (!safeCompareStrings(providedKey, env.ADMIN_API_KEY)) {
    throw ApiError.forbidden('Forbidden: invalid admin credentials');
  }

  const rawActor = req.headers['x-admin-actor'];
  const actor =
    typeof rawActor === 'string' && /^[a-zA-Z0-9_.@-]{1,64}$/.test(rawActor.trim())
      ? rawActor.trim()
      : 'admin';

  req.admin = {
    id: actor,
    role: 'admin',
  };

  next();
}

/**
 * Extracts optional customer identity headers (`X-Customer-Id`, `X-Order-Token`)
 * so order and payment endpoints can verify order ownership.
 */
export function extractCustomerContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const customerIdHeader = req.headers['x-customer-id'];
  const orderTokenHeader = req.headers['x-order-token'];

  if (typeof customerIdHeader === 'string' && customerIdHeader.trim().length > 0) {
    req.customerId = customerIdHeader.trim();
  }

  if (typeof orderTokenHeader === 'string' && orderTokenHeader.trim().length > 0) {
    req.orderToken = orderTokenHeader.trim();
  }

  next();
}
