import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const id =
    typeof incomingId === 'string' && incomingId.trim().length > 0 && incomingId.length <= 128
      ? incomingId.trim()
      : randomUUID();

  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
