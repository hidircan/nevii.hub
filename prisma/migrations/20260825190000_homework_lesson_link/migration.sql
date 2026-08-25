-- Faz 3C (docs/implementation-plans/notaplan-product-expansion.md) — Homework
-- gets an optional lessonId link, plus an idempotent reminder-log table for
-- the "lesson processed without homework" warning (once per lesson, ever).

ALTER TABLE "Homework" ADD COLUMN IF NOT EXISTS "lessonId" TEXT;
CREATE INDEX IF NOT EXISTS "Homework_tenantId_lessonId_idx" ON "Homework" ("tenantId", "lessonId");

CREATE TABLE IF NOT EXISTS "LessonHomeworkReminderLog" (
  "id" TEXT NOT NULL,
  "tenantId" VARCHAR(100) NOT NULL,
  "lessonId" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LessonHomeworkReminderLog_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LessonHomeworkReminderLog_tenantId_lessonId_key'
  ) THEN
    ALTER TABLE "LessonHomeworkReminderLog"
      ADD CONSTRAINT "LessonHomeworkReminderLog_tenantId_lessonId_key" UNIQUE ("tenantId", "lessonId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LessonHomeworkReminderLog_tenantId_fkey'
  ) THEN
    ALTER TABLE "LessonHomeworkReminderLog"
      ADD CONSTRAINT "LessonHomeworkReminderLog_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
