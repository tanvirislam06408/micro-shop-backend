import type { Request, Response } from 'express';
import { getAdminAnalytics } from './admin-analytics.service.js';

export async function handleGetAdminAnalytics(
  req: Request,
  res: Response,
): Promise<void> {
  const daysParam = req.query.days ? parseInt(String(req.query.days), 10) : 14;
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 14;

  const analytics = await getAdminAnalytics(days);

  res.status(200).json({
    success: true,
    data: analytics,
  });
}
