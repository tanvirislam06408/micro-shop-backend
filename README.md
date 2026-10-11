# Micro Shop Backend

A production-ready, security-hardened backend built with **Node.js**, **Express 5**, **TypeScript (strict mode)**, **PostgreSQL**, **Prisma ORM v7** (`@prisma/adapter-pg`), **Zod v4**, **Helmet**, **CORS**, **express-rate-limit**, and **Vitest + Supertest**.

---

## Architecture & Schema Design Notes

### Why `Payment` has no `Order` or `User` Foreign Keys Yet
To avoid inventing speculative `Order` or `User` schemas before business requirements exist, the database schema implements only the foundational `Payment` model (`payments` table). When order management or user accounts are introduced in a future iteration, a nullable or required `orderId` / `userId` foreign key can be added via a non-destructive Prisma migration.

### Manual bKash Payment Security Model
- **Method & Currency**: Fixed to `manual_bkash` and `BDT` (Bangladeshi Taka).
- **Statuses**: `pending` → `verified` | `rejected`.
- **Never Trust Client Amounts**: The `POST /api/v1/payments` endpoint uses a strict Zod schema that rejects any request attempting to supply `amount`, `currency`, or `status`. Amounts are always determined server-side (`resolveServerSideAmount()`).
- **Normalized & Unique Transaction IDs**: Customer-submitted bKash Transaction IDs (`TrxID`) are trimmed, uppercased, validated as alphanumeric (`6–20` chars), and enforced with a PostgreSQL `@unique` constraint to prevent duplicate submissions (`409 Conflict`).
- **Manual Administrator Verification Required**: Submitting a `transactionId` **never** marks a payment as `verified`. Every submission starts in `pending` status. An authorized administrator must independently inspect the merchant's official bKash statement/account to verify that the funds and `TrxID` settled before transitioning the payment status to `verified` or `rejected`.
- **Zero Credential Exposure**: No bKash PIN, OTP, password, or secret credentials are requested, stored, or logged anywhere in this system.

---

## 1. Prerequisites

- **Node.js**: `v20.x` or `v22.x` LTS recommended
- **Package Manager**: `pnpm` (`v10+`)
- **Database**: Local **PostgreSQL** (`v14+`) or a managed PostgreSQL database such as **Neon**

---

## 2. Dependency Installation

From the project root directory, install all runtime and development dependencies:

```bash
pnpm install
```

---

## 3. Configure `.env`

Copy the example environment file to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and provide your configuration values:

```dotenv
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/micro_shop?schema=public
FRONTEND_URL=http://localhost:3000
LOG_LEVEL=info
```

> **Security Note**: `.env` is ignored by Git (`.gitignore`). Never commit real `.env` files or database credentials to version control, and never expose `DATABASE_URL` to frontend applications.

---

## 4. How to Install and Connect Local PostgreSQL

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Create a database and user:

```bash
sudo -u postgres psql -c "CREATE DATABASE micro_shop;"
sudo -u postgres psql -c "CREATE DATABASE micro_shop_test;"
```

Set `DATABASE_URL` in `.env`:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/micro_shop?schema=public
```

---

## 5. How to Connect a Neon Database

1. Sign in to [Neon](https://neon.tech) and create a new project.
2. Copy the pooled or direct PostgreSQL connection string from the Neon dashboard.
3. Ensure `?sslmode=require` is appended to the URL and set it in `.env`:

```dotenv
DATABASE_URL=postgresql://<user>:<password>@ep-example-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

---

## 6. Generate Prisma Client

Prisma v7 outputs the generated TypeScript client directly into `src/generated/prisma` and connects via `@prisma/adapter-pg`. Generate the client with:

```bash
pnpm db:generate
```

---

## 7. Create and Apply Migrations

### Development (Create & Apply Migrations)
When connected to your development PostgreSQL database, apply existing migrations and create new ones interactively:

```bash
pnpm db:migrate
```

### Production / CI (Apply Committed Migrations Safely)
To apply pending migrations in staging or production without interactive prompts or destructive resets:

```bash
pnpm db:deploy
```

### Inspect Database with Prisma Studio
```bash
pnpm db:studio
```

---

## 8. Run the Development Server

Start the server in watch mode with hot reload:

```bash
pnpm dev
```

Verify the health endpoint:

```bash
curl http://localhost:5000/api/v1/health
```

---

## 9. Run Checks, Tests, and Production Builds

Run all commands in the following order:

```bash
# 1. Generate Prisma Client
pnpm db:generate

# 2. Run ESLint
pnpm lint

# 3. Run strict TypeScript typechecking
pnpm typecheck

# 4. Run test suite (uses isolated test env / TEST_DATABASE_URL, never production data)
pnpm test

# 5. Compile production build to dist/
pnpm build

# 6. Start compiled production server
pnpm start
```

---

## 10. How to Deploy Securely

1. **Environment Variables**: Inject `NODE_ENV=production`, `PORT`, `DATABASE_URL` (with `sslmode=require`), `FRONTEND_URL` (exact HTTPS origin of your frontend), and `LOG_LEVEL=info` via your platform's secret manager.
2. **Build & Migrate in Release Pipeline**:
   ```bash
   pnpm install --frozen-lockfile
   pnpm db:generate
   pnpm build
   pnpm db:deploy
   ```
3. **Run Process**:
   ```bash
   pnpm start
   ```
4. **Reverse Proxy & TLS**: Run behind a TLS-terminating reverse proxy or load balancer (e.g., Nginx, Cloudflare, AWS ALB) and ensure PostgreSQL network access is restricted to the backend service only.
