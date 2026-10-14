import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import { handleGetAdminAnalytics } from './admin-analytics.controller.js';

const router: Router = Router();

router.use(requireAdmin);

router.get('/overview', handleGetAdminAnalytics);

export { router as adminAnalyticsRoutes };
