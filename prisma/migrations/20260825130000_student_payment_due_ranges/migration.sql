-- Faz 1A (docs/implementation-plans/notaplan-product-expansion.md) — students
-- may now have multiple payment-due-day ranges instead of a single day.
-- Additive, nullable, idempotent (IF NOT EXISTS). No backfill: existing
-- `paymentDueDay` rows keep working via the application-layer fallback
-- (src/lib/payment-due-ranges.ts) — no derived data needs to be written.

ALTER TABLE "Student"
  ADD COLUMN IF NOT EXISTS "paymentDueRanges" JSONB;
