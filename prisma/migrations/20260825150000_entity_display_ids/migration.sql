-- Faz 12 (docs/implementation-plans/notaplan-product-expansion.md) — human
-- readable, tenant-scoped, immutable entity numbers (S00001/T00001/P00001).
-- Additive, nullable, idempotent (IF NOT EXISTS). Multiple NULL displayId
-- rows are allowed under Postgres unique-constraint semantics (NULL is
-- never equal to NULL), so existing records are unaffected until the
-- backfill script assigns them a number.

CREATE TABLE IF NOT EXISTS "EntitySequence" (
  "tenantId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "EntitySequence_pkey" PRIMARY KEY ("tenantId", "entityType")
);

ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "displayId" TEXT;
ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "displayId" TEXT;
ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "displayId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Student_tenantId_displayId_key'
  ) THEN
    ALTER TABLE "Student" ADD CONSTRAINT "Student_tenantId_displayId_key" UNIQUE ("tenantId", "displayId");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Teacher_tenantId_displayId_key'
  ) THEN
    ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_tenantId_displayId_key" UNIQUE ("tenantId", "displayId");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StaffMember_tenantId_displayId_key'
  ) THEN
    ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_tenantId_displayId_key" UNIQUE ("tenantId", "displayId");
  END IF;
END $$;
