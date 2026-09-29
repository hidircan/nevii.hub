-- Hakedis defteri (2026-09-30) — YALNIZCA ADDITIVE, mevcut satirlara DOKUNMAZ, backfill YOK.
-- TeacherPayout: iptal alanlari, donmus ders kalemleri, odeme/duzeltme defteri (JSON), iyimser surum.
--   payments NULL = eski kayit (status "paid" ise tum tutar tek odemede odenmis sayilir).
-- TeacherFeeRule: devre disi birakma izi. Yeni tablo: TeacherPayoutExclusion (dersi hakedisten haric tutma).
-- Rollback: yeni kolonlari DROP COLUMN, tabloyu DROP TABLE ile kaldirmak yeterli.

-- AlterTable
ALTER TABLE "TeacherPayout" ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledByUserId" TEXT,
ADD COLUMN "cancelReason" TEXT,
ADD COLUMN "lineSnapshot" JSONB,
ADD COLUMN "payments" JSONB,
ADD COLUMN "adjustments" JSONB,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TeacherFeeRule" ADD COLUMN "deactivatedAt" TIMESTAMP(3),
ADD COLUMN "deactivatedByUserId" TEXT,
ADD COLUMN "deactivationReason" TEXT;

-- CreateTable
CREATE TABLE "TeacherPayoutExclusion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherPayoutExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherPayoutExclusion_tenantId_lessonId_key" ON "TeacherPayoutExclusion"("tenantId", "lessonId");

-- AddForeignKey
ALTER TABLE "TeacherPayoutExclusion" ADD CONSTRAINT "TeacherPayoutExclusion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2026-09-30 — deneme dersi veli adi (opsiyonel; NULL = girilmemis).
-- AlterTable
ALTER TABLE "TrialLesson" ADD COLUMN "parentName" TEXT;
