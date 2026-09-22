-- Additive. Eski satırlar null kalır; backfill ayrı ve isteğe bağlıdır.
ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "weeklyHoursThreshold" INTEGER;
ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "performanceWeights" JSONB;
