-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending_payment', 'payment_submitted', 'paid', 'rejected');

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "customer_id" VARCHAR(100) NOT NULL,
    "order_token" VARCHAR(100) NOT NULL,
    "customer_email" VARCHAR(255) NOT NULL,
    "customer_phone" VARCHAR(30) NOT NULL,
    "customer_note" TEXT,
    "product_id" VARCHAR(100) NOT NULL,
    "product_name" VARCHAR(255) NOT NULL,
    "plan_name" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
    "status" "OrderStatus" NOT NULL DEFAULT 'pending_payment',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "payments"
ADD COLUMN "order_id" TEXT,
ADD COLUMN "customer_id" VARCHAR(100),
ADD COLUMN "rejection_reason" TEXT,
ADD COLUMN "verified_by" VARCHAR(100),
ADD COLUMN "verified_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_customer_id_idx" ON "payments"("customer_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
