import express, { type Express, type RequestHandler } from 'express';
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

// Trust first proxy (required for express-rate-limit behind Vercel / reverse proxies)
app.set('trust proxy', 1);

// --- Security middleware ---
const helmetMiddleware =
  typeof helmet === 'function'
    ? (helmet as unknown as () => RequestHandler)
    : (helmet as unknown as { default: () => RequestHandler }).default;

app.use(helmetMiddleware());
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

// --- Root status route ---
app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      service: 'micro-shop-backend',
      status: 'running',
      healthEndpoint: '/api/v1/health',
    },
  });
});

// --- API Routes ---
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin/payments', adminPaymentRoutes);

// --- 404 and error handling ---
app.use(notFound);
app.use(errorHandler);

export { app };
export default app;
