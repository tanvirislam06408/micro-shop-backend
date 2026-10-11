import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Prisma } from '../src/generated/prisma/client.js';

const mockQueryRaw = vi.fn();
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    payment: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

import { app } from '../src/app.js';
import { ApiError } from '../src/utils/api-error.js';
import { errorHandler, redactSensitiveText } from '../src/middleware/error-handler.js';
import { requestId } from '../src/middleware/request-id.js';

describe('API Endpoints, Security, Validation & Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/health', () => {
    it('returns 200 OK with consistent JSON when database is reachable', async () => {
      mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.body).toMatchObject({
        success: true,
        data: {
          status: 'ok',
          database: 'connected',
        },
      });
      expect(typeof res.body.data.timestamp).toBe('string');
      expect(typeof res.body.data.uptime).toBe('number');
    });

    it('returns 503 degraded without exposing internal DB details when database fails', async () => {
      mockQueryRaw.mockRejectedValueOnce(
        new Error('Connection refused at postgresql://secretuser:secretpass@10.0.0.1:5432/db'),
      );

      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({
        success: true,
        data: {
          status: 'degraded',
          database: 'disconnected',
        },
      });
      expect(JSON.stringify(res.body)).not.toContain('secretpass');
      expect(JSON.stringify(res.body)).not.toContain('10.0.0.1');
    });
  });

  describe('Unknown Routes (404 Handler)', () => {
    it('returns 404 JSON for unknown GET route', async () => {
      const res = await request(app).get('/api/v1/unknown-endpoint');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        error: {
          message: 'Route GET /api/v1/unknown-endpoint not found',
          statusCode: 404,
        },
      });
    });
  });

  describe('Manual bKash Payment Endpoints & Invalid Requests', () => {
    it('creates a pending manual_bkash payment in BDT and normalizes transactionId to uppercase', async () => {
      mockFindUnique.mockResolvedValueOnce(null);
      const now = new Date();
      mockCreate.mockResolvedValueOnce({
        id: 'pay_test_123',
        amount: new Prisma.Decimal('0.00'),
        currency: 'BDT',
        transactionId: 'BK98765432',
        method: 'manual_bkash',
        status: 'pending',
        payerPhone: '01712345678',
        createdAt: now,
        updatedAt: now,
      });

      const res = await request(app)
        .post('/api/v1/payments')
        .send({
          transactionId: '  bk98765432 ',
          payerPhone: '01712345678',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: 'pay_test_123',
        amount: '0.00',
        currency: 'BDT',
        transactionId: 'BK98765432',
        method: 'manual_bkash',
        status: 'pending',
      });
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { transactionId: 'BK98765432' },
      });
    });

    it('rejects duplicate transactionId submissions with 409 Conflict', async () => {
      mockFindUnique.mockResolvedValueOnce({
        id: 'pay_existing',
        transactionId: 'BK98765432',
      });

      const res = await request(app)
        .post('/api/v1/payments')
        .send({
          transactionId: 'bk98765432',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.statusCode).toBe(409);
      expect(res.body.error.message).toMatch(/already been submitted/i);
    });

    it('rejects client requests that attempt to supply amount or status', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({
          transactionId: 'BK12345678',
          amount: 500,
          status: 'verified',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.statusCode).toBe(400);
    });

    it('rejects invalid transactionId or phone format with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({
          transactionId: 'ab!',
          payerPhone: '12345',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects malformed JSON bodies with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Content-Type', 'application/json')
        .send('{"transactionId": "BK123"');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Invalid JSON payload');
    });
  });

  describe('Centralized Error Handling & Redaction', () => {
    it('handles operational ApiError instances with their status code', async () => {
      const testApp = express();
      testApp.use(requestId);
      testApp.get('/operational-error', () => {
        throw ApiError.badRequest('Custom validation failure');
      });
      testApp.use(errorHandler);

      const res = await request(testApp)
        .get('/operational-error')
        .set('X-Request-Id', 'req-custom-123');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: {
          message: 'Custom validation failure',
          statusCode: 400,
          requestId: 'req-custom-123',
        },
      });
    });

    it('masks unexpected errors as 500 Internal server error', async () => {
      const testApp = express();
      testApp.use(requestId);
      testApp.get('/crash', () => {
        throw new Error('Database password=supersecret leaked');
      });
      testApp.use(errorHandler);

      const res = await request(testApp).get('/crash');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Internal server error');
      expect(JSON.stringify(res.body)).not.toContain('supersecret');
    });

    it('redacts connection strings, passwords, PINs, and OTPs from log strings', () => {
      const raw =
        'Failed connecting to postgresql://admin:mySecretPass@db.neon.tech/shop with pin=12345 and otp:999888';
      const redacted = redactSensitiveText(raw);

      expect(redacted).not.toContain('mySecretPass');
      expect(redacted).not.toContain('12345');
      expect(redacted).not.toContain('999888');
      expect(redacted).toContain('[REDACTED]');
    });
  });
});
