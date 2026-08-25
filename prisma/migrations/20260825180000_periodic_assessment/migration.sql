-- Faz 3B (docs/implementation-plans/notaplan-product-expansion.md) — dört
-- haftalık genel gelişim değerlendirmesi. Yeni, bağımsız tablo; mevcut
-- LessonAssessment'a dokunmaz.

CREATE TABLE IF NOT EXISTS "PeriodicAssessment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "relatedLessonIds" JSONB NOT NULL,
  "overallProgressNote" TEXT NOT NULL,
  "strengthsNote" TEXT,
  "areasForImprovementNote" TEXT,
  "recommendationNote" TEXT,
  "submittedBy" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PeriodicAssessment_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PeriodicAssessment_tenantId_studentId_teacherId_periodSta_key'
  ) THEN
    ALTER TABLE "PeriodicAssessment"
      ADD CONSTRAINT "PeriodicAssessment_tenantId_studentId_teacherId_periodSta_key"
      UNIQUE ("tenantId", "studentId", "teacherId", "periodStart", "periodEnd");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PeriodicAssessment_tenantId_studentId_idx" ON "PeriodicAssessment" ("tenantId", "studentId");
CREATE INDEX IF NOT EXISTS "PeriodicAssessment_tenantId_teacherId_idx" ON "PeriodicAssessment" ("tenantId", "teacherId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PeriodicAssessment_tenantId_fkey'
  ) THEN
    ALTER TABLE "PeriodicAssessment"
      ADD CONSTRAINT "PeriodicAssessment_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
