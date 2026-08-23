-- Additive / idempotent: monthly per-student makeup allowance + announcement
-- attachment metadata. Safe on existing rows (DEFAULT 2 backfills School).
-- PostgreSQL / Supabase.

ALTER TABLE "School"
  ADD COLUMN IF NOT EXISTS "monthlyMakeupAllowance" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "Announcement"
  ADD COLUMN IF NOT EXISTS "attachments" JSONB NULL;
