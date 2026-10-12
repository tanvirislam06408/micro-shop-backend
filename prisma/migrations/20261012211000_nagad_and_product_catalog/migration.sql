-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'manual_nagad';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "payment_method" "PaymentMethod" NOT NULL DEFAULT 'manual_bkash';

-- CreateTable
CREATE TABLE "products" (
    "id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "default_plan" VARCHAR(255) NOT NULL,
    "amount_bdt" DECIMAL(12,2) NOT NULL,
    "old_price_bdt" DECIMAL(12,2),
    "in_stock" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_in_stock_idx" ON "products"("in_stock");
