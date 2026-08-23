-- Additive Tahsilat Agent v3 fields. Existing rows keep defaults.
-- Open-case uniqueness is enforced in application + keyed lock; a partial
-- unique index is added only when no duplicate open rows exist.

ALTER TABLE "PaymentFollowUpCase"
  ADD COLUMN IF NOT EXISTS "openingBalance" INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "currentBalance" INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NULL DEFAULT 'TRY',
  ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3) NULL,
  ADD COLUMN IF NOT EXISTS "daysOverdue" INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "selectedChannel" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "approvedMessage" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "lastError" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3) NULL,
  ADD COLUMN IF NOT EXISTS "attributedPaidSnapshot" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "attempts" JSONB NULL,
  ADD COLUMN IF NOT EXISTS "events" JSONB NULL;

CREATE INDEX IF NOT EXISTS "PaymentFollowUpCase_tenantId_paymentId_idx"
  ON "PaymentFollowUpCase"("tenantId", "paymentId");

-- Skip unique index if duplicate open cases already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "PaymentFollowUpCase"
    WHERE status NOT IN ('paid', 'lost', 'dismissed')
    GROUP BY "tenantId", "paymentId"
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "PaymentFollowUpCase_tenant_payment_open_uidx"
      ON "PaymentFollowUpCase"("tenantId", "paymentId")
      WHERE status NOT IN ('paid', 'lost', 'dismissed');
  END IF;
END $$;
