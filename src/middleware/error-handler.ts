import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/api-error.js';
import { env } from '../config/env.js';

const SENSITIVE_PATTERNS = [
  /postgres(?:ql)?:\/\/[^\s"']+/gi,
  /(password|secret|token|authorization|cookie|pin|otp|admin_api_key|x-admin-key|order_token)\s*[:=]\s*[^\s&"']+/gi,
];

/**
 * Redacts connection strings, credentials, PINs, OTPs, and secrets from log text.
 */
export function redactSensitiveText(input: string): string {
  let sanitized = input;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

export function errorHandler(
  err: Error & { type?: string; status?: number },
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.id ?? 'unknown';

  // Handle malformed JSON or payload too large from express.json()
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: {
        message: 'Invalid JSON payload',
        statusCode: 400,
        requestId,
      },
    });
    return;
  }

  if (err.type === 'entity.too.large' || err.status === 413) {
    res.status(413).json({
      success: false,
      error: {
        message: 'Request payload too large',
        statusCode: 413,
        requestId,
      },
    });
    return;
  }

  if (err instanceof ApiError) {
    if (env.NODE_ENV !== 'test' || env.LOG_LEVEL === 'debug') {
      console.error(
        JSON.stringify({
          level: 'warn',
          requestId,
          statusCode: err.statusCode,
          message: redactSensitiveText(err.message),
          path: req.path,
          method: req.method,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        statusCode: err.statusCode,
        requestId,
      },
    });
    return;
  }

  // Unexpected error — redact sensitive details and never leak internals to client
  if (env.NODE_ENV !== 'test' || env.LOG_LEVEL === 'debug') {
    console.error(
      JSON.stringify({
        level: 'error',
        requestId,
        message: redactSensitiveText(err.message || 'Unexpected error'),
        stack:
          env.NODE_ENV === 'development' && err.stack
            ? redactSensitiveText(err.stack)
            : undefined,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
      statusCode: 500,
      requestId,
    },
  });
}
