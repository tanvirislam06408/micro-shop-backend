import type { Request, Response } from 'express';
import { getHealthStatus } from './health.service.js';

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const health = await getHealthStatus();
  const statusCode = health.status === 'ok' ? 200 : 503;

  res.status(statusCode).json({
    success: true,
    data: health,
  });
}
