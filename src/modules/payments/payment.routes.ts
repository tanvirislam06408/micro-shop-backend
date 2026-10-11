import { Router } from 'express';
import { handleSubmitPayment, handleGetPayment } from './payment.controller.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { strictLimiter } from '../../middleware/rate-limit.js';
import {
  submitPaymentSchema,
  getPaymentParamsSchema,
} from './payment.validation.js';

const router = Router();

router.post(
  '/',
  strictLimiter,
  validateRequest({ body: submitPaymentSchema }),
  handleSubmitPayment,
);

router.get(
  '/:id',
  validateRequest({ params: getPaymentParamsSchema }),
  handleGetPayment,
);

export { router as paymentRoutes };
