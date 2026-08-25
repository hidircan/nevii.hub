-- Faz 10 (docs/implementation-plans/notaplan-product-expansion.md) — ExpenseRecord
-- gets additive/nullable fields (subcategory, supplier, branch, currency, tax,
-- due date, payment/approval status, recurring-rule link); new RecurringExpenseRule
-- and Budget models for the recurring-expense + budget-vs-actual comparison step.

ALTER TABLE "ExpenseRecord" ADD COLUMN IF NOT EXISTS "subcategory" TEXT;
ALTER TABLE "ExpenseRecord" ADD COLUMN IF NOT EXISTS "supplier" TEXT;
ALTER TABLE "ExpenseRecord" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "ExpenseRecord" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'TRY';
ALTER TABLE "ExpenseRecord" ADD COLUMN IF NOT EXISTS "taxAmount" INTEGER;
ALTER TABLE "ExpenseRecord" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "ExpenseRecord" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT;
ALTER TABLE "ExpenseRecord" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "ExpenseRecord" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT;
ALTER TABLE "ExpenseRecord" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
ALTER TABLE "ExpenseRecord" ADD COLUMN IF NOT EXISTS "recurringRuleId" TEXT;
CREATE INDEX IF NOT EXISTS "ExpenseRecord_tenantId_branchId_idx" ON "ExpenseRecord" ("tenantId", "branchId");

CREATE TABLE IF NOT EXISTS "RecurringExpenseRule" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "category"    TEXT NOT NULL,
  "subcategory" TEXT,
  "supplier"    TEXT,
  "branchId"    TEXT,
  "amount"      INTEGER NOT NULL,
  "frequency"   TEXT NOT NULL,
  "nextRunDate" TIMESTAMP(3) NOT NULL,
  "note"        TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdBy"   TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RecurringExpenseRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RecurringExpenseRule_tenantId_idx" ON "RecurringExpenseRule" ("tenantId");
CREATE INDEX IF NOT EXISTS "RecurringExpenseRule_tenantId_active_nextRunDate_idx" ON "RecurringExpenseRule" ("tenantId", "active", "nextRunDate");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecurringExpenseRule_tenantId_fkey') THEN
    ALTER TABLE "RecurringExpenseRule"
      ADD CONSTRAINT "RecurringExpenseRule_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Budget" (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "category"     TEXT NOT NULL,
  "branchId"     TEXT,
  "period"       TEXT NOT NULL,
  "targetAmount" INTEGER NOT NULL,
  "createdBy"    TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Budget_tenantId_period_idx" ON "Budget" ("tenantId", "period");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Budget_tenantId_category_branchId_period_key'
  ) THEN
    ALTER TABLE "Budget"
      ADD CONSTRAINT "Budget_tenantId_category_branchId_period_key" UNIQUE ("tenantId", "category", "branchId", "period");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Budget_tenantId_fkey') THEN
    ALTER TABLE "Budget"
      ADD CONSTRAINT "Budget_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
