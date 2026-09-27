-- Reconcile schema drift between `prisma/migrations` and `prisma/schema.prisma`.
--
-- WHY THIS MIGRATION EXISTS
-- The 8 models `Subscription`, `Table`, `Refund`, `Shift`, `Discount`, `AuditLog`,
-- `Game` and `GameSession`, the enums `PaymentMethod`, `TableStatus` and
-- `SubscriptionStatus`, several later enum values, and a number of columns on
-- `Shop`, `Order`, `OrderItem`, `MenuItem`, `MenuCategory` and `LoyaltyProfile`
-- were applied to the live database by out-of-band scripts
-- (`backend/create-tables.js`, `backend/run-migration.js`,
-- `backend/init-supabase-db.js`) and never captured as a migration. Replaying
-- `prisma/migrations` against an empty database therefore produced a schema the
-- application could not run on. This migration closes that gap.
--
-- WHY IT IS WRITTEN DEFENSIVELY
-- Because the same objects already exist in the production database, every
-- statement here is idempotent: `CREATE TABLE IF NOT EXISTS`,
-- `ADD COLUMN IF NOT EXISTS`, `CREATE ... INDEX IF NOT EXISTS`,
-- `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, and `DO $$ ... EXCEPTION WHEN
-- duplicate_object THEN NULL; END $$;` guards around `CREATE TYPE` and
-- `ADD CONSTRAINT` (neither of which supports `IF NOT EXISTS` in PostgreSQL).
-- Running it on a database that already has the objects is a no-op; running it
-- on a fresh database creates them. Every column added NOT NULL carries a
-- DEFAULT consistent with schema.prisma, so the ALTERs are safe on tables that
-- already hold rows.
--
-- NOTE ON `ALTER TYPE ... ADD VALUE`
-- Prisma wraps a migration file in a single transaction. `ALTER TYPE ... ADD
-- VALUE` inside a transaction block is only permitted on PostgreSQL 12 and
-- newer (on 11 and older it fails with "cannot run inside a transaction
-- block"). The target here is Postgres 16 (Neon/Supabase), so this is fine; on
-- an older server these three statements would have to be split out and run
-- outside the transaction.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'SPLIT', 'RAZORPAY', 'PAY_AT_COUNTER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'CLEANING', 'RESERVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'GRACE', 'SUSPENDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterEnum
-- Backfill for databases where an out-of-band script created these types with a
-- narrower set of labels (e.g. create-tables.js made "PaymentMethod" with only
-- CASH/UPI/CARD/SPLIT). No-ops on a fresh database.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CASH';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'UPI';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CARD';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'SPLIT';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'RAZORPAY';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PAY_AT_COUNTER';

-- AlterEnum
ALTER TYPE "TableStatus" ADD VALUE IF NOT EXISTS 'AVAILABLE';
ALTER TYPE "TableStatus" ADD VALUE IF NOT EXISTS 'OCCUPIED';
ALTER TYPE "TableStatus" ADD VALUE IF NOT EXISTS 'CLEANING';
ALTER TYPE "TableStatus" ADD VALUE IF NOT EXISTS 'RESERVED';

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIAL';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAST_DUE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'GRACE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- AlterEnum
ALTER TYPE "OrderSource" ADD VALUE IF NOT EXISTS 'STOREFRONT';

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'HELD';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CAPTAIN';

-- AlterTable
ALTER TABLE "LoyaltyProfile" ADD COLUMN IF NOT EXISTS "shopId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "MenuCategory" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "isVeg" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cashierId" TEXT,
ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "discountCode" TEXT,
ADD COLUMN IF NOT EXISTS "notes" TEXT,
ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS "razorpayOrderId" TEXT,
ADD COLUMN IF NOT EXISTS "razorpayPaymentId" TEXT,
ADD COLUMN IF NOT EXISTS "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "tableId" TEXT,
ADD COLUMN IF NOT EXISTS "tableNumber" TEXT,
ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "nameSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "priceSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "taxRateSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "email" TEXT,
ADD COLUMN IF NOT EXISTS "fssaiNumber" TEXT,
ADD COLUMN IF NOT EXISTS "gstNumber" TEXT,
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "logo" TEXT,
ADD COLUMN IF NOT EXISTS "tagline" TEXT,
ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "upiId" TEXT,
ALTER COLUMN "themeColor" SET DEFAULT '#6366F1';

-- CreateTable
CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'STARTER',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "razorpaySubId" TEXT,
    "priceMonthly" INTEGER NOT NULL DEFAULT 499,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Table" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "qrCode" TEXT,
    "position" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "refundedBy" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FULL',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Shift" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "openingCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingCash" DOUBLE PRECISION,
    "expectedCash" DOUBLE PRECISION,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Discount" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "minOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxDiscount" DOUBLE PRECISION,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "shopId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Game" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SCRATCH_CARD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "attemptsPerDay" INTEGER NOT NULL DEFAULT 1,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "rewardType" TEXT NOT NULL DEFAULT 'POINTS',
    "rewardValue" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "minOrderAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GameSession" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "customerId" TEXT,
    "deviceId" TEXT,
    "won" BOOLEAN NOT NULL DEFAULT false,
    "rewardType" TEXT,
    "rewardValue" DOUBLE PRECISION,
    "rewardClaimed" BOOLEAN NOT NULL DEFAULT false,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_shopId_key" ON "Subscription"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Discount_shopId_code_key" ON "Discount"("shopId", "code");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "Table" ADD CONSTRAINT "Table_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "Shift" ADD CONSTRAINT "Shift_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "Discount" ADD CONSTRAINT "Discount_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "Game" ADD CONSTRAINT "Game_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
