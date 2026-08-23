-- İletişim Merkezi — kalıcı SMS/WhatsApp taslak ve onay kaydı. Yeni,
-- tenant-scoped tablo; mevcut hiçbir tabloya dokunmaz. Bildirimler
-- (Notification modeli) ile karıştırılmaz — bu, dış SMS/WhatsApp kuyruğudur.
-- PostgreSQL / Supabase (bkz. schema.prisma `datasource db { provider =
-- "postgresql" }` + src/lib/db.ts'in `@prisma/adapter-pg` + `pg` Pool
-- kullanan gerçek runtime bağlantısı — bu ikisi tek doğruluk kaynağıdır;
-- geçmişteki bazı migration dosyaları ve README/PROJECT.md'deki
-- "MySQL/MariaDB" ifadeleri güncel değildir, bkz. final rapor).

CREATE TABLE "CommunicationMessage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "recipientType" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "recipientPhone" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "messageType" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_approval',
  "draftBody" TEXT NOT NULL,
  "approvedBodySnapshot" TEXT,
  "createdBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "providerResultCode" TEXT,
  "providerResultSummary" TEXT,
  "blockedReasonCode" TEXT,
  "blockedReasonMessage" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "approvalBatchId" TEXT,
  "events" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunicationMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunicationMessage_tenantId_idempotencyKey_key"
  ON "CommunicationMessage"("tenantId", "idempotencyKey");

CREATE INDEX "CommunicationMessage_tenantId_status_idx"
  ON "CommunicationMessage"("tenantId", "status");

CREATE INDEX "CommunicationMessage_tenantId_resourceType_resourceId_idx"
  ON "CommunicationMessage"("tenantId", "resourceType", "resourceId");

CREATE INDEX "CommunicationMessage_tenantId_channel_messageType_idx"
  ON "CommunicationMessage"("tenantId", "channel", "messageType");

ALTER TABLE "CommunicationMessage"
  ADD CONSTRAINT "CommunicationMessage_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
