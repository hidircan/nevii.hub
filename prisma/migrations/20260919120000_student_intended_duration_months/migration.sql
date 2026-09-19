-- 2026-09-19 — kayıtta seçilen sözleşme süresi (ay). Null'a izinli, veri kaybı yok.
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "intendedDurationMonths" INTEGER;
