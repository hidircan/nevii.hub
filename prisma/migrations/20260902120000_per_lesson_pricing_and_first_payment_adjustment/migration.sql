-- P0-1 (2026-09-02) — ders başı net ücret birincil ücret modeli + ilk
-- ödeme manuel düzeltme audit alanları. Tümü nullable/additive:
-- - Student.pricingModel/perLessonNetFee: NULL = mevcut tüm kayıtlar
--   (LEGACY aylık paket), yalnız YENİ kayıtlar "per_lesson" seçebilir.
-- - Payment.autoSuggestedAmount/adjustmentReason/adjustedBy/adjustedAt:
--   yalnız GERÇEK bir manuel ilk ödeme düzeltmesi varsa dolu.
--
-- BU MİGRATION HİÇBİR shared/staging/production VERİTABANINA UYGULANMADI —
-- yalnızca dosya olarak eklendi.

ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "pricingModel" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "perLessonNetFee" INTEGER;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "autoSuggestedAmount" INTEGER;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "adjustmentReason" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "adjustedBy" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "adjustedAt" TIMESTAMP(3);
