-- Faz 1B (docs/implementation-plans/notaplan-product-expansion.md) — students
-- may now have multiple simultaneous types (e.g. both "MEB" and "London
-- College of Music Hazırlık"). Additive, nullable, idempotent (IF NOT
-- EXISTS). No backfill: existing `studentType` rows keep working via the
-- application-layer fallback (src/lib/student-types.ts) — no derived data
-- needs to be written.

ALTER TABLE "Student"
  ADD COLUMN IF NOT EXISTS "studentTypes" JSONB;
