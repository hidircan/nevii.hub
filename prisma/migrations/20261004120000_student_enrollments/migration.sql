-- 2026-10-04 — tek öğrenci, birden fazla eğitim. Yalnız nullable kolon ekler (eklemeli, geriye uyumlu:
-- eski kod bu kolonları okumaz/yazmaz; NULL = eski tek eğitimli kayıt).
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "enrollments" JSONB;
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "enrollmentId" TEXT;
ALTER TABLE "LessonSeries" ADD COLUMN IF NOT EXISTS "enrollmentId" TEXT;
ALTER TABLE "StudentContract" ADD COLUMN IF NOT EXISTS "enrollmentId" TEXT;
