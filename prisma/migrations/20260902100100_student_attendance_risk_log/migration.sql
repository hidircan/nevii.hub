-- P0-2 (2026-09-02) — aylık "işlenmiş ders" risk bildirimi idempotency
-- günlüğü. LessonHomeworkReminderLog ile AYNI desen: tekilleştirme anahtarı
-- (tenantId, studentId, calendarMonth) — aynı öğrenci/aynı ay için risk
-- bildirimi İKİNCİ KEZ üretilmez.
--
-- BU MİGRATION HİÇBİR shared/staging/production VERİTABANINA UYGULANMADI —
-- yalnızca dosya olarak eklendi.

CREATE TABLE IF NOT EXISTS "StudentAttendanceRiskLog" (
  "id" TEXT NOT NULL,
  "tenantId" VARCHAR(100) NOT NULL,
  "studentId" VARCHAR(100) NOT NULL,
  "calendarMonth" VARCHAR(7) NOT NULL,
  "threshold" INTEGER NOT NULL,
  "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "triggeredByLessonId" VARCHAR(100) NOT NULL,

  CONSTRAINT "StudentAttendanceRiskLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StudentAttendanceRiskLog_tenantId_studentId_idx"
  ON "StudentAttendanceRiskLog" ("tenantId", "studentId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentAttendanceRiskLog_tenantId_studentId_calendarMonth_key'
  ) THEN
    ALTER TABLE "StudentAttendanceRiskLog"
      ADD CONSTRAINT "StudentAttendanceRiskLog_tenantId_studentId_calendarMonth_key"
      UNIQUE ("tenantId", "studentId", "calendarMonth");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentAttendanceRiskLog_tenantId_fkey'
  ) THEN
    ALTER TABLE "StudentAttendanceRiskLog"
      ADD CONSTRAINT "StudentAttendanceRiskLog_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
