-- Öğretmenin öğrenciyi değerlendirmesi — TeacherFeedback'in ters yönü.
-- Yeni, tenant-scoped tablo; mevcut hiçbir tabloya dokunmaz. Additive,
-- idempotent (IF NOT EXISTS) — staging'de migration geçmişi
-- (`_prisma_migrations`) henüz kurulu değil (bkz. önceki oturumun read-only
-- envanteri); bu dosya da diğerleri gibi doğrudan SQL olarak, tek seferlik
-- uygulanmalı — `prisma migrate deploy` DEĞİL (P3005 verir).
--
-- Ham kayıt yalnızca yönetici ve ilgili öğretmene açık; öğrenci/veli görmez
-- (uygulama katmanında zorunlu kılınır, bkz. src/lib/student-feedback.ts).

CREATE TABLE IF NOT EXISTS "StudentFeedback" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "submittedBy" TEXT NOT NULL,
  "scores" JSONB NOT NULL,
  "comment" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StudentFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StudentFeedback_tenantId_studentId_idx"
  ON "StudentFeedback"("tenantId", "studentId");

CREATE INDEX IF NOT EXISTS "StudentFeedback_tenantId_teacherId_idx"
  ON "StudentFeedback"("tenantId", "teacherId");

CREATE INDEX IF NOT EXISTS "StudentFeedback_tenantId_status_idx"
  ON "StudentFeedback"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "StudentFeedback_tenantId_studentId_teacherId_idx"
  ON "StudentFeedback"("tenantId", "studentId", "teacherId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentFeedback_tenantId_fkey'
  ) THEN
    ALTER TABLE "StudentFeedback"
      ADD CONSTRAINT "StudentFeedback_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
