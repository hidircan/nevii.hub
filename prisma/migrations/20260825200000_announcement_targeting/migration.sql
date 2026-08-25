-- Faz 4 (docs/implementation-plans/notaplan-product-expansion.md) — Announcement
-- gets optional multi-rule (OR'd) targeting and a materialized recipient count,
-- both additive/nullable so existing single-audienceType rows are unaffected.

ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "rules" JSONB;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "recipientCount" INTEGER;
