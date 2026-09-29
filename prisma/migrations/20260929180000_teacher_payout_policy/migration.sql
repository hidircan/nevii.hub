-- Ogretmen hakedis politikasi (2026-09-29) — YALNIZCA ADDITIVE.
-- Yeni tablo: ay bazli politika (satir yoksa mevcut ogretmen bazli dakika ucreti aynen gecerli).
-- TeacherPayout'a iki nullable kolon: kayit anindaki politika izi. Mevcut satirlara DOKUNMAZ, backfill YOK.
-- Rollback: tabloyu DROP TABLE, iki kolonu DROP COLUMN ile kaldirmak yeterli.

-- AlterTable
ALTER TABLE "TeacherPayout" ADD COLUMN "pricingPolicy" TEXT,
ADD COLUMN "pricingSnapshot" JSONB;

-- CreateTable
CREATE TABLE "TeacherPayoutPolicyPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "policy" TEXT NOT NULL,
    "rate30" DOUBLE PRECISION,
    "rate40" DOUBLE PRECISION,
    "rate50" DOUBLE PRECISION,
    "setByUserId" TEXT NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherPayoutPolicyPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherPayoutPolicyPeriod_tenantId_month_key" ON "TeacherPayoutPolicyPeriod"("tenantId", "month");

-- AddForeignKey
ALTER TABLE "TeacherPayoutPolicyPeriod" ADD CONSTRAINT "TeacherPayoutPolicyPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
