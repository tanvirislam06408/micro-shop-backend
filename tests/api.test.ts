import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Prisma } from '../src/generated/prisma/client.js';

const mockQueryRaw = vi.fn();
const mockPaymentFindUnique = vi.fn();
const mockPaymentFindMany = vi.fn();
const mockPaymentCreate = vi.fn();
const mockPaymentUpdate = vi.fn();
const mockOrderFindUnique = vi.fn();
const mockOrderCreate = vi.fn();
const mockOrderUpdate = vi.fn();
const mockProductFindUnique = vi.fn();
const mockProductFindMany = vi.fn();
const mockProductCreate = vi.fn();
const mockProductCreateMany = vi.fn();
const mockProductUpdate = vi.fn();

vi.mock('../src/lib/prisma.js', () => {
  const client = {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
    payment: {
      findUnique: (...args: unknown[]) => mockPaymentFindUnique(...args),
      findMany: (...args: unknown[]) => mockPaymentFindMany(...args),
      create: (...args: unknown[]) => mockPaymentCreate(...args),
      update: (...args: unknown[]) => mockPaymentUpdate(...args),
    },
    order: {
      findUnique: (...args: unknown[]) => mockOrderFindUnique(...args),
      create: (...args: unknown[]) => mockOrderCreate(...args),
      update: (...args: unknown[]) => mockOrderUpdate(...args),
    },
    product: {
      findUnique: (...args: unknown[]) => mockProductFindUnique(...args),
      findMany: (...args: unknown[]) => mockProductFindMany(...args),
      create: (...args: unknown[]) => mockProductCreate(...args),
      createMany: (...args: unknown[]) => mockProductCreateMany(...args),
      update: (...args: unknown[]) => mockProductUpdate(...args),
    },
  };
  return { prisma: client };
});

import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { ApiError } from '../src/utils/api-error.js';
import {
  errorHandler,
  redactSensitiveText,
} from '../src/middleware/error-handler.js';
import { requestId } from '../src/middleware/request-id.js';

describe('API Endpoints, Security, Manual bKash Workflow & Admin Verification', () => {
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
        new Error(
          'Connection refused at postgresql://secretuser:secretpass@10.0.0.1:5432/db',
        ),
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

  describe('Order Creation & Server-Side Amount Calculation (/api/v1/orders)', () => {
    it('creates an order with server-calculated BDT amount from product catalog and returns merchant bKash config', async () => {
      const now = new Date();
      mockOrderCreate.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'ord_gemini_123',
        ...data,
        paidAt: null,
        createdAt: now,
        updatedAt: now,
      }));

      const res = await request(app)
        .post('/api/v1/orders')
        .set('X-Customer-Id', 'cust_user_1')
        .send({
          productId: 'gemini-ai-pro',
          customerEmail: 'customer@example.com',
          customerPhone: '01712345678',
          customerNote: 'Please activate soon',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: 'ord_gemini_123',
        customerId: 'cust_user_1',
        productId: 'gemini-ai-pro',
        productName: 'Gemini AI Pro',
        amount: '350.00',
        currency: 'BDT',
        status: 'pending_payment',
        merchant: {
          merchantName: env.MERCHANT_NAME,
          merchantNumber: env.BKASH_MERCHANT_NUMBER,
          currency: 'BDT',
          method: 'manual_bkash',
        },
      });
      expect(typeof res.body.data.orderToken).toBe('string');
      expect(res.body.data.orderToken.length).toBeGreaterThanOrEqual(32);
    });

    it('rejects order creation when client attempts to tamper with amount or status', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .send({
          productId: 'gemini-ai-pro',
          customerEmail: 'customer@example.com',
          customerPhone: '01712345678',
          amount: '1.00',
          status: 'paid',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(mockOrderCreate).not.toHaveBeenCalled();
    });

    it('enforces order ownership when fetching order details (GET /api/v1/orders/:id)', async () => {
      const now = new Date();
      mockOrderFindUnique.mockResolvedValue({
        id: 'ord_gemini_123',
        customerId: 'cust_owner_1',
        orderToken: 'secret_token_owner_1',
        customerEmail: 'owner@example.com',
        customerPhone: '01712345678',
        customerNote: null,
        productId: 'gemini-ai-pro',
        productName: 'Gemini AI Pro',
        planName: '18 Months Validity',
        amount: new Prisma.Decimal('350.00'),
        currency: 'BDT',
        status: 'pending_payment',
        paidAt: null,
        createdAt: now,
        updatedAt: now,
        payments: [],
      });

      // Unauthorized customer attempt
      const forbiddenRes = await request(app)
        .get('/api/v1/orders/ord_gemini_123')
        .set('X-Customer-Id', 'cust_attacker_99');

      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenRes.body.success).toBe(false);

      // Authorized customer with valid X-Order-Token
      const okRes = await request(app)
        .get('/api/v1/orders/ord_gemini_123')
        .set('X-Order-Token', 'secret_token_owner_1');

      expect(okRes.status).toBe(200);
      expect(okRes.body.success).toBe(true);
      expect(okRes.body.data.id).toBe('ord_gemini_123');
      expect(okRes.body.data.amount).toBe('350.00');
      // Never leak orderToken on GET
      expect(okRes.body.data.orderToken).toBeUndefined();
    });
  });

  describe('Manual bKash Payment Endpoints & Order Ownership (/api/v1/payments)', () => {
    it('submits a manual_bkash payment for an owned order, uses server order amount, and keeps status pending', async () => {
      const now = new Date();
      mockPaymentFindUnique.mockResolvedValueOnce(null);
      mockOrderFindUnique.mockResolvedValueOnce({
        id: 'ord_100',
        customerId: 'cust_100',
        orderToken: 'tok_valid_100',
        customerEmail: 'buyer@example.com',
        customerPhone: '01711223344',
        productId: 'chatgpt-plus-owner',
        productName: 'ChatGPT Plus (Owner Account)',
        planName: 'Personal Mail Owner Access',
        amount: new Prisma.Decimal('1550.00'),
        currency: 'BDT',
        status: 'pending_payment',
        payments: [],
      });

      mockPaymentCreate.mockResolvedValueOnce({
        id: 'pay_order_100',
        orderId: 'ord_100',
        customerId: 'cust_100',
        amount: new Prisma.Decimal('1550.00'),
        currency: 'BDT',
        transactionId: 'BKA9876543',
        method: 'manual_bkash',
        status: 'pending',
        payerPhone: '01711223344',
        createdAt: now,
        updatedAt: now,
      });

      mockOrderUpdate.mockResolvedValueOnce({
        id: 'ord_100',
        status: 'payment_submitted',
      });

      const res = await request(app)
        .post('/api/v1/payments')
        .set('X-Order-Token', 'tok_valid_100')
        .send({
          orderId: 'ord_100',
          transactionId: '  bka9876543 ',
          payerPhone: '01711223344',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: 'pay_order_100',
        orderId: 'ord_100',
        customerId: 'cust_100',
        amount: '1550.00',
        currency: 'BDT',
        transactionId: 'BKA9876543',
        method: 'manual_bkash',
        status: 'pending',
        orderStatus: 'payment_submitted',
      });
    });

    it('rejects payment submission when order belongs to a different customer (403 Forbidden)', async () => {
      mockPaymentFindUnique.mockResolvedValueOnce(null);
      mockOrderFindUnique.mockResolvedValueOnce({
        id: 'ord_100',
        customerId: 'cust_real_owner',
        orderToken: 'tok_real_owner',
        amount: new Prisma.Decimal('350.00'),
        currency: 'BDT',
        status: 'pending_payment',
        payments: [],
      });

      const res = await request(app)
        .post('/api/v1/payments')
        .set('X-Customer-Id', 'cust_other_user')
        .send({
          orderId: 'ord_100',
          transactionId: 'BK99887766',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(mockPaymentCreate).not.toHaveBeenCalled();
    });

    it('prevents duplicate submissions for an order that already has a pending payment', async () => {
      mockPaymentFindUnique.mockResolvedValueOnce(null);
      mockOrderFindUnique.mockResolvedValueOnce({
        id: 'ord_100',
        customerId: 'cust_100',
        orderToken: 'tok_valid_100',
        amount: new Prisma.Decimal('350.00'),
        currency: 'BDT',
        status: 'payment_submitted',
        payments: [{ id: 'pay_1', status: 'pending', transactionId: 'BK11111111' }],
      });

      const res = await request(app)
        .post('/api/v1/payments')
        .set('X-Order-Token', 'tok_valid_100')
        .send({
          orderId: 'ord_100',
          transactionId: 'BK22222222',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/already been submitted/i);
      expect(mockPaymentCreate).not.toHaveBeenCalled();
    });

    it('creates a standalone pending manual_bkash payment in BDT and normalizes transactionId to uppercase', async () => {
      mockPaymentFindUnique.mockResolvedValueOnce(null);
      const now = new Date();
      mockPaymentCreate.mockResolvedValueOnce({
        id: 'pay_test_123',
        orderId: null,
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
      expect(mockPaymentFindUnique).toHaveBeenCalledWith({
        where: { transactionId: 'BK98765432' },
      });
    });

    it('rejects duplicate transactionId submissions with 409 Conflict', async () => {
      mockPaymentFindUnique.mockResolvedValueOnce({
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

  describe('Admin Payment Verification & Authorization (/api/v1/admin/payments)', () => {
    it('rejects unauthenticated requests to admin endpoints with 401 Unauthorized', async () => {
      const listRes = await request(app).get('/api/v1/admin/payments');
      expect(listRes.status).toBe(401);

      const verifyRes = await request(app)
        .patch('/api/v1/admin/payments/pay_123/verify')
        .send({ status: 'verified' });
      expect(verifyRes.status).toBe(401);
    });

    it('rejects invalid admin key with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/admin/payments')
        .set('X-Admin-Key', 'wrong-admin-key-value');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('allows authorized admin to list pending manual bKash payments', async () => {
      const now = new Date();
      mockPaymentFindMany.mockResolvedValueOnce([
        {
          id: 'pay_pending_1',
          orderId: 'ord_100',
          customerId: 'cust_100',
          amount: new Prisma.Decimal('350.00'),
          currency: 'BDT',
          transactionId: 'BK77788899',
          method: 'manual_bkash',
          status: 'pending',
          payerPhone: '01711223344',
          adminNote: null,
          rejectionReason: null,
          verifiedBy: null,
          verifiedAt: null,
          createdAt: now,
          updatedAt: now,
          order: {
            id: 'ord_100',
            customerId: 'cust_100',
            customerEmail: 'buyer@example.com',
            customerPhone: '01711223344',
            customerNote: null,
            productId: 'gemini-ai-pro',
            productName: 'Gemini AI Pro',
            planName: '18 Months Validity',
            amount: new Prisma.Decimal('350.00'),
            currency: 'BDT',
            status: 'payment_submitted',
            paidAt: null,
            createdAt: now,
          },
        },
      ]);

      const res = await request(app)
        .get('/api/v1/admin/payments?status=pending')
        .set('X-Admin-Key', env.ADMIN_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        id: 'pay_pending_1',
        orderId: 'ord_100',
        amount: '350.00',
        transactionId: 'BK77788899',
        status: 'pending',
        order: {
          id: 'ord_100',
          productName: 'Gemini AI Pro',
          status: 'payment_submitted',
        },
      });
    });

    it('verifies a pending payment and transitions the associated order to paid', async () => {
      const now = new Date();
      mockPaymentFindUnique.mockResolvedValueOnce({
        id: 'pay_pending_1',
        orderId: 'ord_100',
        customerId: 'cust_100',
        amount: new Prisma.Decimal('350.00'),
        currency: 'BDT',
        transactionId: 'BK77788899',
        method: 'manual_bkash',
        status: 'pending',
      });

      mockPaymentUpdate.mockResolvedValueOnce({
        id: 'pay_pending_1',
        orderId: 'ord_100',
        customerId: 'cust_100',
        amount: new Prisma.Decimal('350.00'),
        currency: 'BDT',
        transactionId: 'BK77788899',
        method: 'manual_bkash',
        status: 'verified',
        rejectionReason: null,
        adminNote: 'Matched bKash statement',
        verifiedBy: 'tanvir_admin',
        verifiedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      mockOrderUpdate.mockResolvedValueOnce({
        id: 'ord_100',
        status: 'paid',
        paidAt: now,
      });

      const res = await request(app)
        .patch('/api/v1/admin/payments/pay_pending_1/verify')
        .set('X-Admin-Key', env.ADMIN_API_KEY)
        .set('X-Admin-Actor', 'tanvir_admin')
        .send({
          status: 'verified',
          adminNote: 'Matched bKash statement',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: 'pay_pending_1',
        status: 'verified',
        verifiedBy: 'tanvir_admin',
        order: {
          id: 'ord_100',
          status: 'paid',
        },
      });
      expect(mockOrderUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ord_100' },
          data: expect.objectContaining({ status: 'paid' }),
        }),
      );
    });

    it('rejects a payment with a rejection reason and ensures order is NOT marked as paid', async () => {
      const now = new Date();
      mockPaymentFindUnique.mockResolvedValueOnce({
        id: 'pay_pending_2',
        orderId: 'ord_200',
        customerId: 'cust_200',
        amount: new Prisma.Decimal('350.00'),
        currency: 'BDT',
        transactionId: 'BKFAKE1234',
        method: 'manual_bkash',
        status: 'pending',
      });

      mockPaymentUpdate.mockResolvedValueOnce({
        id: 'pay_pending_2',
        orderId: 'ord_200',
        customerId: 'cust_200',
        amount: new Prisma.Decimal('350.00'),
        currency: 'BDT',
        transactionId: 'BKFAKE1234',
        method: 'manual_bkash',
        status: 'rejected',
        rejectionReason: 'TrxID not found in merchant bKash statement',
        adminNote: null,
        verifiedBy: 'admin',
        verifiedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      mockOrderUpdate.mockResolvedValueOnce({
        id: 'ord_200',
        status: 'rejected',
        paidAt: null,
      });

      const res = await request(app)
        .patch('/api/v1/admin/payments/pay_pending_2/verify')
        .set('Authorization', `Bearer ${env.ADMIN_API_KEY}`)
        .send({
          status: 'rejected',
          rejectionReason: 'TrxID not found in merchant bKash statement',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: 'pay_pending_2',
        status: 'rejected',
        rejectionReason: 'TrxID not found in merchant bKash statement',
        order: {
          id: 'ord_200',
          status: 'rejected',
          paidAt: null,
        },
      });
    });

    it('prevents modifying a payment that has already been verified (409 Conflict)', async () => {
      mockPaymentFindUnique.mockResolvedValueOnce({
        id: 'pay_verified_1',
        orderId: 'ord_100',
        status: 'verified',
      });

      const res = await request(app)
        .patch('/api/v1/admin/payments/pay_verified_1/verify')
        .set('X-Admin-Key', env.ADMIN_API_KEY)
        .send({
          status: 'rejected',
        });

      expect(res.status).toBe(409);
      expect(mockPaymentUpdate).not.toHaveBeenCalled();
    });
  });

  describe('Nagad Workflow & Admin Product Stock/Price/Description Management', () => {
    it('creates a manual_nagad order and submits a manual_nagad payment', async () => {
      const now = new Date();
      mockProductFindUnique.mockResolvedValueOnce({
        id: 'gemini-ai-pro',
        name: 'Gemini AI Pro',
        description: 'Gemini Pro 18M',
        defaultPlan: '18 Months Validity',
        amountBdt: new Prisma.Decimal('350.00'),
        oldPriceBdt: new Prisma.Decimal('1500.00'),
        inStock: true,
        updatedAt: now,
      });

      mockOrderCreate.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'ord_nagad_1',
        ...data,
        paidAt: null,
        createdAt: now,
        updatedAt: now,
      }));

      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('X-Customer-Id', 'cust_nagad_1')
        .send({
          productId: 'gemini-ai-pro',
          customerEmail: 'nagad@example.com',
          customerPhone: '01911223344',
          paymentMethod: 'manual_nagad',
        });

      expect(orderRes.status).toBe(201);
      expect(orderRes.body.data.paymentMethod).toBe('manual_nagad');
      expect(orderRes.body.data.merchant).toMatchObject({
        method: 'manual_nagad',
        dialCode: '*167#',
        merchantNumber: env.NAGAD_MERCHANT_NUMBER,
      });

      mockPaymentFindUnique.mockResolvedValueOnce(null);
      mockOrderFindUnique.mockResolvedValueOnce({
        id: 'ord_nagad_1',
        customerId: 'cust_nagad_1',
        orderToken: orderRes.body.data.orderToken,
        customerPhone: '01911223344',
        amount: new Prisma.Decimal('350.00'),
        currency: 'BDT',
        paymentMethod: 'manual_nagad',
        status: 'pending_payment',
        payments: [],
      });

      mockPaymentCreate.mockResolvedValueOnce({
        id: 'pay_nagad_1',
        orderId: 'ord_nagad_1',
        customerId: 'cust_nagad_1',
        amount: new Prisma.Decimal('350.00'),
        currency: 'BDT',
        transactionId: 'NG99887766',
        method: 'manual_nagad',
        status: 'pending',
        createdAt: now,
      });

      mockOrderUpdate.mockResolvedValueOnce({
        id: 'ord_nagad_1',
        status: 'payment_submitted',
        paymentMethod: 'manual_nagad',
      });

      const payRes = await request(app)
        .post('/api/v1/payments')
        .set('X-Order-Token', orderRes.body.data.orderToken)
        .send({
          orderId: 'ord_nagad_1',
          transactionId: 'ng99887766',
          method: 'manual_nagad',
        });

      expect(payRes.status).toBe(201);
      expect(payRes.body.data.method).toBe('manual_nagad');
      expect(payRes.body.data.transactionId).toBe('NG99887766');
    });

    it('blocks order creation when product is marked Stock Out (inStock: false)', async () => {
      mockProductFindUnique.mockResolvedValueOnce({
        id: 'gemini-ai-pro',
        name: 'Gemini AI Pro',
        description: 'Gemini Pro',
        defaultPlan: '18 Months Validity',
        amountBdt: new Prisma.Decimal('350.00'),
        oldPriceBdt: null,
        inStock: false,
      });

      const res = await request(app)
        .post('/api/v1/orders')
        .send({
          productId: 'gemini-ai-pro',
          customerEmail: 'buyer@example.com',
          customerPhone: '01712345678',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/out of stock/i);
      expect(mockOrderCreate).not.toHaveBeenCalled();
    });

    it('allows admin to update product inStock status, price, and description via PATCH /api/v1/admin/products/:id', async () => {
      const now = new Date();
      mockProductFindUnique.mockResolvedValueOnce({
        id: 'capcut-pro',
        name: 'CapCut Pro',
        description: 'Old description',
        defaultPlan: '1 Month Validity',
        amountBdt: new Prisma.Decimal('250.00'),
        oldPriceBdt: new Prisma.Decimal('800.00'),
        inStock: true,
        updatedAt: now,
      });

      mockProductUpdate.mockResolvedValueOnce({
        id: 'capcut-pro',
        name: 'CapCut Pro',
        description: 'Updated Pro video editing with 4K 60fps',
        defaultPlan: '1 Month Validity',
        amountBdt: new Prisma.Decimal('290.00'),
        oldPriceBdt: new Prisma.Decimal('800.00'),
        inStock: false,
        updatedAt: now,
      });

      const res = await request(app)
        .patch('/api/v1/admin/products/capcut-pro')
        .set('X-Admin-Key', env.ADMIN_API_KEY)
        .send({
          inStock: false,
          amountBdt: 290,
          description: 'Updated Pro video editing with 4K 60fps',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: 'capcut-pro',
        amountBdt: '290.00',
        description: 'Updated Pro video editing with 4K 60fps',
        inStock: false,
      });
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
