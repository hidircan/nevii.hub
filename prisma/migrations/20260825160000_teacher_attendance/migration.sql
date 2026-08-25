-- Faz 2 (docs/implementation-plans/notaplan-product-expansion.md) — teacher's
-- own attendance per lesson, fully independent of student attendance.
-- Additive, nullable, idempotent (IF NOT EXISTS).

ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "teacherAttendanceStatus" TEXT;
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "teacherAttendanceAt" TIMESTAMP(3);
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "teacherAttendanceBy" TEXT;
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "teacherAttendanceNote" TEXT;
