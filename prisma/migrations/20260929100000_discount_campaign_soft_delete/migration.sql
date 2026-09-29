-- Kampanya silme (2026-09-29) — YALNIZCA ADDITIVE, nullable kolonlar.
-- Mevcut satirlara DOKUNMAZ, backfill YOK. NULL = silinmemis (eski davranis aynen).
-- "Sil" = soft delete: satir, kullanim sayaci ve ogrencilerdeki appliedCampaignIds korunur
-- (gecmis fiyat/rapor izi bozulmaz). Aktor/gerekce ayrica AuditLog'da.
-- Rollback: uc kolonu DROP COLUMN ile kaldirmak yeterli (yalniz silme bilgisi kaybolur).

-- AlterTable
ALTER TABLE "DiscountCampaign" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedByUserId" TEXT,
ADD COLUMN "deletionReason" TEXT;
