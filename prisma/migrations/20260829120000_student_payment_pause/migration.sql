-- Nilüfer Acar politikası §1E — yetkili personelin gecikmiş ödeme nedeniyle
-- ders programını geçici durdurması. `active` (enrollment durumu) İLE
-- KARIŞTIRILMAMASI için ayrı alanlar; NULL = duraklatılmamış.
ALTER TABLE "Student" ADD COLUMN "paymentPauseStatus" TEXT;
ALTER TABLE "Student" ADD COLUMN "paymentPausedAt" TIMESTAMP(3);
ALTER TABLE "Student" ADD COLUMN "paymentPauseReason" TEXT;
ALTER TABLE "Student" ADD COLUMN "paymentPausedBy" TEXT;
