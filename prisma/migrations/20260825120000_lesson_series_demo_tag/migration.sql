-- Faz 6 (docs/implementation-plans/notaplan-product-expansion.md) — marks
-- LessonSeries rows created by scripts/seed-demo-schedule.ts so demo data is
-- identifiable and never confused with a real, human-entered schedule.
-- Additive, nullable, idempotent (IF NOT EXISTS) — no existing row changes.

ALTER TABLE "LessonSeries"
  ADD COLUMN IF NOT EXISTS "demoTag" TEXT;
