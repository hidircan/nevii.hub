-- Sahip kararı (2026-09-16) — Payment.firstCollectionIncludesNextMonth:
-- kayıt anı ilk tahsilatı takip eden ayın TAM ücretini de kapsıyor mu?
-- Kayıt ekranındaki AÇIK kullanıcı seçimi; sözleşme taksit planı bunu okur
-- (önceden ders sayısından yeniden türetiliyordu ve iki ekran farklı sayınca
-- bir ay eksik sözleşme tutarı oluşuyordu).
--
-- Nullable/additive: eski satırlar NULL kalır (= seçim yok, birleştirme yok).
-- Rollback: DROP COLUMN ile kaldırılabilir.
--
-- BU MIGRATION HİÇBİR shared/staging/production/test VERİTABANINA
-- UYGULANMADI — yalnızca dosya olarak eklendi.

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "firstCollectionIncludesNextMonth" BOOLEAN;
