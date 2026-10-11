# Micro Shop Backend

A production-ready, security-hardened backend built with **Node.js**, **Express 5**, **TypeScript (strict mode)**, **PostgreSQL**, **Prisma ORM v7** (`@prisma/adapter-pg`), **Zod v4**, **Helmet**, **CORS**, **express-rate-limit**, and **Vitest + Supertest**.

---

## Architecture & Manual bKash Payment System

### Database Models (`prisma/schema.prisma`)
- **`Order` (`orders` table)**:
  - Stores customer orders (`id`, `customerId`, `orderToken`, `customerEmail`, `customerPhone`, `customerNote`, `productId`, `productName`, `planName`, `amount` in `BDT`, `status`: `pending_payment` | `payment_submitted` | `paid` | `rejected`, `paidAt`, `createdAt`, `updatedAt`).
  - Amounts are always calculated on the server from the trusted product catalog (`src/config/catalog.ts`).
- **`Payment` (`payments` table)**:
  - Stores manual bKash payment submissions (`id`, `orderId`, `customerId`, `amount`, `currency: 'BDT'`, `transactionId`, `method: 'manual_bkash'`, `status`: `pending` | `verified` | `rejected`, `adminNote`, `rejectionReason`, `verifiedBy`, `verifiedAt`, `payerPhone`, `createdAt`, `updatedAt`).

### Security & Verification Workflow
- **Server-Side Amount Calculation**: Both `POST /api/v1/orders` and `POST /api/v1/payments` use strict Zod schemas that reject any client attempt to supply `amount`, `currency`, or `status`.
- **Order Ownership Verification**: Every customer order creation returns a cryptographic `orderToken`. Accessing an order (`GET /api/v1/orders/:id`) or submitting a payment for an order (`POST /api/v1/payments`) verifies that the authenticated customer owns the order (`X-Order-Token` or `X-Customer-Id`) using constant-time comparison (`crypto.timingSafeEqual`).
- **Normalized & Unique Transaction IDs**: Customer-submitted bKash Transaction IDs (`TrxID`) are trimmed, uppercased, validated as alphanumeric (`6–20` chars), and enforced with a PostgreSQL `@unique` constraint (`409 Conflict` on duplicates).
- **Manual Admin Verification Only**: Submitting a `transactionId` **never** marks a payment as `verified` or an order as `paid`. Every submission starts as `pending` (`order.status = 'payment_submitted'`). An authorized administrator must inspect the merchant's official bKash statement and call `PATCH /api/v1/admin/payments/:id/verify` (protected by `requireAdmin`) to mark the payment as `verified` (which atomically marks the order `paid`) or `rejected` (with an optional `rejectionReason`).
- **Zero Credential Exposure**: No bKash PIN, OTP, password, or secret credentials are requested, stored, or logged anywhere in this system.

---

## Environment Variables (`micro-shop-backend/.env`)

```dotenv
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/micro_shop?schema=public
FRONTEND_URL=http://localhost:3000
LOG_LEVEL=info

# Manual bKash Merchant Configuration (Server-Side)
BKASH_MERCHANT_NUMBER=01960515811
MERCHANT_NAME="Micro-Shop BD"
MERCHANT_LOGO_URL=/logo.png

# Admin Authentication Key (Min 16 characters; required in production)
ADMIN_API_KEY=replace-with-strong-admin-secret-key-min-16-chars
```

---

## API Endpoints

- `GET /api/v1/health` — Database & service health check
- `GET /api/v1/orders/merchant-config` — Public merchant bKash configuration
- `POST /api/v1/orders` — Create a customer order (server calculates BDT amount)
- `GET /api/v1/orders/:id` — Fetch order & payment status (requires `X-Order-Token` or `X-Customer-Id`)
- `POST /api/v1/payments` — Submit a manual bKash `transactionId` for an order
- `GET /api/v1/payments/:id` — Fetch payment details (requires order ownership)
- `GET /api/v1/admin/payments?status=pending|verified|rejected` — List manual bKash payments (requires `X-Admin-Key` or `Authorization: Bearer <ADMIN_API_KEY>`)
- `PATCH /api/v1/admin/payments/:id/verify` — Verify or reject a manual bKash payment inside a DB transaction (requires `X-Admin-Key` or `Authorization: Bearer <ADMIN_API_KEY>`)

---

## Commands

```bash
# 1. Generate Prisma Client
pnpm db:generate

# 2. Apply migrations in development
pnpm db:migrate

# 3. Run ESLint
pnpm lint

# 4. Run strict TypeScript typechecking
pnpm typecheck

# 5. Run test suite
pnpm test

# 6. Build production bundle
pnpm build
```
