-- Faz 9A/9B (docs/implementation-plans/notaplan-product-expansion.md) — StaffMember
-- gets additive/nullable özlük fields (emergency contact, contract dates, SGK
-- status, encrypted IBAN) and an annual advance limit; new StaffAdvance model
-- for the salary-advance request/approve/pay/cancel flow.

ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT;
ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT;
ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "contractStartDate" TIMESTAMP(3);
ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "contractEndDate" TIMESTAMP(3);
ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "sgkStatus" TEXT;
ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "ibanCipher" TEXT;
ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "ibanLast4" TEXT;
ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "annualAdvanceLimit" INTEGER;

CREATE TABLE IF NOT EXISTS "StaffAdvance" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "staffId"       TEXT NOT NULL,
  "amount"        INTEGER NOT NULL,
  "requestDate"   TIMESTAMP(3) NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'pending_approval',
  "approvedBy"    TEXT,
  "approvedAt"    TIMESTAMP(3),
  "paidAt"        TIMESTAMP(3),
  "paymentMethod" TEXT,
  "description"   TEXT,
  "createdBy"     TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffAdvance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StaffAdvance_tenantId_staffId_idx" ON "StaffAdvance" ("tenantId", "staffId");
CREATE INDEX IF NOT EXISTS "StaffAdvance_tenantId_status_idx" ON "StaffAdvance" ("tenantId", "status");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StaffAdvance_tenantId_fkey'
  ) THEN
    ALTER TABLE "StaffAdvance"
      ADD CONSTRAINT "StaffAdvance_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StaffAdvance_staffId_fkey'
  ) THEN
    ALTER TABLE "StaffAdvance"
      ADD CONSTRAINT "StaffAdvance_staffId_fkey"
      FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
