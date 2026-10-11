import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { requestId } from './middleware/request-id.js';
import { apiLimiter } from './middleware/rate-limit.js';
import { notFound } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { orderRoutes } from './modules/orders/order.routes.js';
import { paymentRoutes } from './modules/payments/payment.routes.js';
import { adminPaymentRoutes } from './modules/payments/admin-payment.routes.js';

const app: Express = express();

// --- Security middleware ---
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

// --- Request parsing ---
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));

// --- Request ID ---
app.use(requestId);

// --- Rate limiting ---
app.use('/api/', apiLimiter);

// --- Routes ---
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin/payments', adminPaymentRoutes);

// --- 404 and error handling ---
app.use(notFound);
app.use(errorHandler);

export { app };
