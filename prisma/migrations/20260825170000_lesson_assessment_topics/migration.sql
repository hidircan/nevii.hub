-- Faz 3A (docs/implementation-plans/notaplan-product-expansion.md) — "çalışılan
-- konular" free-text fields on LessonAssessment. Additive, nullable, idempotent.

ALTER TABLE "LessonAssessment" ADD COLUMN IF NOT EXISTS "piecesWorked" TEXT;
ALTER TABLE "LessonAssessment" ADD COLUMN IF NOT EXISTS "etudesWorked" TEXT;
ALTER TABLE "LessonAssessment" ADD COLUMN IF NOT EXISTS "technicalWork" TEXT;
ALTER TABLE "LessonAssessment" ADD COLUMN IF NOT EXISTS "theoryWork" TEXT;
