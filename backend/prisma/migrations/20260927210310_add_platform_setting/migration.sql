-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "platformName" TEXT NOT NULL DEFAULT 'CaféOS',
    "supportEmail" TEXT NOT NULL DEFAULT 'support@cafeos.com',
    "defaultCommissionRate" DOUBLE PRECISION NOT NULL DEFAULT 150,
    "starterPriceMonthly" INTEGER NOT NULL DEFAULT 499,
    "growthPriceMonthly" INTEGER NOT NULL DEFAULT 999,
    "proPriceMonthly" INTEGER NOT NULL DEFAULT 1999,
    "trialDays" INTEGER NOT NULL DEFAULT 14,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 7,
    "newSignupsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "affiliateProgramEnabled" BOOLEAN NOT NULL DEFAULT true,
    "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "gamesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

