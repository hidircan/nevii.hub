-- P0 (2026-09-03) — sözleşme taksit satırlarına GÖRÜNÜR tahsilat türü,
-- kapsanan dönem etiketi, dönem bazlı kırılım ve otomatik/manuel kaynak
-- bilgisi eklenir (bkz. src/lib/types.ts ContractInstallmentKind,
-- src/lib/contracts.ts buildPerLessonInstallmentSchedule). Tümü
-- nullable/additive: mevcut hiçbir Payment/StudentContract satırı
-- etkilenmez, yalnız YENİ per-lesson sözleşme akışı bu alanları doldurur.
--
-- BU MİGRATION HİÇBİR shared/staging/production VERİTABANINA UYGULANMADI —
-- yalnızca dosya olarak eklendi.

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "installmentKind" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "installmentPeriodLabel" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "installmentBreakdown" JSONB;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "installmentComputationSource" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "installmentNote" TEXT;
