-- PostgreSQL repair migration for the general-purpose critical-action audit
-- trail. The legacy 20260804125240_add_audit_log migration is MySQL dialect
-- and cannot create this table on the active PostgreSQL runtime.
--
-- Additive and idempotent: preserves existing AuditLog rows when a table is
-- already present, and creates only the schema required by prisma/schema.prisma.
-- AuditLog intentionally has no Tenant foreign key: audit history must remain
-- queryable after tenant deletion; tenant scope is enforced by application code.

CREATE TABLE IF NOT EXISTS "AuditLog" (
"id" TEXT NOT NULL,
"tenantId" TEXT NOT NULL,
"actorUserId" TEXT NOT NULL,
"actorRole" TEXT NOT NULL,
"action" TEXT NOT NULL,
"entityType" TEXT NOT NULL,
"entityId" TEXT NOT NULL,
"outcome" TEXT NOT NULL,
"meta" JSONB,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_action_createdAt_idx"
ON "AuditLog"("tenantId", "action", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_entityType_entityId_idx"
ON "AuditLog"("tenantId", "entityType", "entityId");
