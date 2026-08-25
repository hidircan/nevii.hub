-- Faz 11 (docs/implementation-plans/notaplan-product-expansion.md) — CRM arama/mesaj
-- altyapısı, sağlayıcıdan bağımsız: CallLog + MessageLog domain modelleri +
-- CommunicationInboundEvent (SmsInboundEvent ile AYNI webhook-idempotency deseni).
-- Gerçek telefoni/mesajlaşma sağlayıcı entegrasyonu bilinçli olarak YOK — yalnız
-- domain modelleri + manuel giriş + webhook iskeleti.

CREATE TABLE IF NOT EXISTS "CallLog" (
  "id"               TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "callerNumber"     TEXT NOT NULL,
  "callerName"       TEXT,
  "contactType"      TEXT,
  "contactId"        TEXT,
  "direction"        TEXT NOT NULL,
  "answered"         BOOLEAN NOT NULL,
  "durationSeconds"  INTEGER,
  "occurredAt"       TIMESTAMP(3) NOT NULL,
  "callbackDone"     BOOLEAN NOT NULL DEFAULT false,
  "callbackAt"       TIMESTAMP(3),
  "callbackByUserId" TEXT,
  "note"             TEXT,
  "createdBy"        TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CallLog_tenantId_occurredAt_idx" ON "CallLog" ("tenantId", "occurredAt");
CREATE INDEX IF NOT EXISTS "CallLog_tenantId_contactType_contactId_idx" ON "CallLog" ("tenantId", "contactType", "contactId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CallLog_tenantId_fkey') THEN
    ALTER TABLE "CallLog"
      ADD CONSTRAINT "CallLog_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "MessageLog" (
  "id"               TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "channel"          TEXT NOT NULL,
  "senderIdentifier" TEXT NOT NULL,
  "occurredAt"       TIMESTAMP(3) NOT NULL,
  "contentOrSummary" TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'unread',
  "contactType"      TEXT,
  "contactId"        TEXT,
  "responderUserId"  TEXT,
  "createdBy"        TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MessageLog_tenantId_occurredAt_idx" ON "MessageLog" ("tenantId", "occurredAt");
CREATE INDEX IF NOT EXISTS "MessageLog_tenantId_contactType_contactId_idx" ON "MessageLog" ("tenantId", "contactType", "contactId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageLog_tenantId_fkey') THEN
    ALTER TABLE "MessageLog"
      ADD CONSTRAINT "MessageLog_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CommunicationInboundEvent" (
  "id"                TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "kind"              TEXT NOT NULL,
  "tenantId"          TEXT,
  "processedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommunicationInboundEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommunicationInboundEvent_tenantId_idx" ON "CommunicationInboundEvent" ("tenantId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CommunicationInboundEvent_providerMessageId_kind_key'
  ) THEN
    ALTER TABLE "CommunicationInboundEvent"
      ADD CONSTRAINT "CommunicationInboundEvent_providerMessageId_kind_key" UNIQUE ("providerMessageId", "kind");
  END IF;
END $$;
