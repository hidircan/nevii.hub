-- P0-2 (2026-09-02) — "İşlendi" işaretlenirken zorunlu, kullanıcı girdisi
-- gerekçe. Nullable — eski "İşlendi" kayıtları gerekçesiz kalır, geçersiz
-- SAYILMAZ (yalnız yeni işaretlemeler backend'de zorunlu tutulur).
--
-- BU MİGRATION HİÇBİR shared/staging/production VERİTABANINA UYGULANMADI —
-- yalnızca dosya olarak eklendi.

ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "lessonProcessedReason" TEXT;
