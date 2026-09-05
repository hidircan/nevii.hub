-- P0 (2026-09-05) — kayıt tarihi ile ders başlangıç tarihi ayrıştırıldı.
-- Nullable: mevcut satırlar backfill GEREKTİRMEZ; NULL okunduğunda uygulama
-- "enrollmentStartDate"e düşer (bkz. resolveLessonStartDay) — davranış değişmez.
ALTER TABLE "Student" ADD COLUMN "lessonStartDate" TIMESTAMP(3);
