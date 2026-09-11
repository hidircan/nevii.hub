-- P1 (2026-09-10) — yeni öğrenci kayıt formundaki "Bizi nereden buldunuz?"
-- alanı için kalıcı Student kolonları (bkz. src/lib/types.ts
-- REFERRAL_SOURCES, docs/agent-memory/PROJECT_STATE.md).
--
-- - Student.referralSource: instagram | google | tavsiye | referans |
--   afis_etkinlik | diger (kanonik ham değer).
-- - Student.referralSourceDetail: "diger" seçiminde serbest metin açıklama.
--
-- İkisi de nullable/additive: mevcut hiçbir Student satırı etkilenmez,
-- backfill GEREKMEZ; NULL okunduğunda uygulama "belirtilmemiş" gösterir.
-- Rollback: iki kolon DROP COLUMN ile kaldırılabilir; uygulama kodu
-- kolonlar yokken undefined okur/yazar (json/memory mod etkilenmez).
--
-- BU MİGRATION HİÇBİR shared/staging/production/test VERİTABANINA
-- UYGULANMADI — yalnızca dosya olarak eklendi.

ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "referralSource" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "referralSourceDetail" TEXT;
