-- Paket & Kampanya Motoru (2026-09-28) — YALNIZCA ADDITIVE kolonlar.
-- Mevcut tablo/veriye DOKUNMAZ, backfill YOK, destructive işlem YOK.
-- Eski Package/DiscountCampaign satirlari yeni kolonlarda NULL/default okunur;
-- uygulama NULL displayId'yi "numarasiz eski kayit" gosterir, davranis korunur.
-- Student.appliedCampaignIds NULL = kampanyasiz/eski kayit.
-- Rollback: asagidaki kolonlari DROP COLUMN + 2 unique index'i DROP ile
-- kaldirmak yeterlidir (yalniz motor verisi kaybolur; diger moduller etkilenmez).

-- AlterTable: Package +3 kolon
ALTER TABLE "Package" ADD COLUMN "displayId" TEXT,
ADD COLUMN "applicableBranchIds" JSONB,
ADD COLUMN "createdByUserId" TEXT;

-- AlterTable: DiscountCampaign +9 kolon
ALTER TABLE "DiscountCampaign" ADD COLUMN "displayId" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "applicableBranchIds" JSONB,
ADD COLUMN "stackingRule" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxUsageCount" INTEGER,
ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "conditions" JSONB,
ADD COLUMN "createdByUserId" TEXT;

-- AlterTable: Student +1 kolon
ALTER TABLE "Student" ADD COLUMN "appliedCampaignIds" JSONB;

-- displayId tenant-kapsamli benzersiz (NULL degerler cakismaz — Postgres NULL'lari esit saymaz).
CREATE UNIQUE INDEX "Package_tenantId_displayId_key" ON "Package"("tenantId", "displayId");
CREATE UNIQUE INDEX "DiscountCampaign_tenantId_displayId_key" ON "DiscountCampaign"("tenantId", "displayId");
