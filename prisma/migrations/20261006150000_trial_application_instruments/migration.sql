-- 2026-10-06 — deneme başvurusunda çoklu enstrüman. Yalnız EKLEME (nullable); mevcut satırlar ve `instrument`
-- sütunu değişmez. Geri alma: ALTER TABLE "TrialApplication" DROP COLUMN "instruments";
ALTER TABLE "TrialApplication" ADD COLUMN "instruments" JSONB;
