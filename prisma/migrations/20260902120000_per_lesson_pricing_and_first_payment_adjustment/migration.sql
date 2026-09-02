-- P0-1 (2026-09-02, ürün kuralı düzeltmesiyle 2026-09-02 içinde GÜNCELLENDİ
-- — bu dosya hiçbir veritabanına hiç uygulanmadığı için serbestçe
-- düzenlendi, yeni bir migration dosyası AÇILMADI) — ders başı ücret
-- yönetici girdisi/seçimi DEĞİLDİR; sistemin aylık ücret + haftalık
-- sıklıktan türettiği hesaplama snapshot'ı + ilk ödeme manuel düzeltme
-- audit alanları. Tümü nullable/additive:
-- - Student.derivedPerLessonAmount: NULL = mevcut tüm kayıtlar (LEGACY,
--   düz monthlyFee), yalnız YENİ kayıtlarda sistem tarafından otomatik
--   dolar — asla client girdisi değildir.
-- - Payment.autoSuggestedAmount/adjustmentReason/adjustedBy/adjustedAt:
--   yalnız GERÇEK bir manuel ilk ödeme düzeltmesi varsa dolu.
--
-- BU MİGRATION HİÇBİR shared/staging/production VERİTABANINA UYGULANMADI —
-- yalnızca dosya olarak eklendi.

ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "derivedPerLessonAmount" INTEGER;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "autoSuggestedAmount" INTEGER;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "adjustmentReason" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "adjustedBy" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "adjustedAt" TIMESTAMP(3);
