import { Router } from 'express';
import {
  handleAdminListPayments,
  handleAdminVerifyPayment,
} from './payment.controller.js';
import { requireAdmin } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { strictLimiter } from '../../middleware/rate-limit.js';
import {
  adminListPaymentsQuerySchema,
  adminVerifyPaymentBodySchema,
  getPaymentParamsSchema,
} from './payment.validation.js';

const router: Router = Router();

// Protect all admin payment routes with server-side authentication and role checks
router.use(requireAdmin);

router.get(
  '/',
  validateRequest({ query: adminListPaymentsQuerySchema }),
  handleAdminListPayments,
);

router.patch(
  '/:id/verify',
  strictLimiter,
  validateRequest({
    params: getPaymentParamsSchema,
    body: adminVerifyPaymentBodySchema,
  }),
  handleAdminVerifyPayment,
);

export { router as adminPaymentRoutes };
