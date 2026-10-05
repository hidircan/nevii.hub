-- 2026-10-06 — Notlar: düzenleme izi + gizleyerek silme. Yalnız nullable kolon ekler (eklemeli).
-- AlterTable
ALTER TABLE "PanelNote" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT,
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3),
ADD COLUMN     "updatedByName" TEXT,
ADD COLUMN     "updatedByUserId" TEXT;

