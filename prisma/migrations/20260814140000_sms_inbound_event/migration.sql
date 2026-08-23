CREATE TABLE IF NOT EXISTS "SmsInboundEvent" (
  "id" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "tenantId" TEXT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsInboundEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsInboundEvent_providerMessageId_kind_key"
  ON "SmsInboundEvent"("providerMessageId", "kind");

CREATE INDEX IF NOT EXISTS "SmsInboundEvent_tenantId_idx"
  ON "SmsInboundEvent"("tenantId");
