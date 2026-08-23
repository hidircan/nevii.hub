-- Staging şema tamamlama (gap-fill) migration'ı — bkz. read-only envanter
-- teşhisi: staging'de eski, kısmi bir şema var (migration geçmişi hiç
-- kurulmadan oluşturulmuş). Bu migration YALNIZCA eksik olan üç parçayı
-- tamamlar; hiçbir tabloyu silmez/yeniden oluşturmaz, hiçbir satırı
-- değiştirmez. `AuditLog`'a HİÇ dokunmuyor — o tablo staging'de zaten
-- doğru (Postgres) şekilde mevcut.
--
-- Tamamen idempotent: bu migration'ın parçalarından biri veya tamamı
-- staging'de zaten varsa (ör. ileride biri tahsilat_agent_v3/
-- sms_inbound_event/add_communication_message migration'larını ayrı
-- şekilde uygularsa), tekrar çalıştırmak hata vermez, veri kaybetmez.

-- ============================================================
-- 1) PaymentFollowUpCase — eksik Tahsilat Agent v3 alanları
--    (prisma/migrations/20260814120000_tahsilat_agent_v3 ile birebir aynı,
--    zaten idempotent — mevcut satırlar varsayılan değerlerini korur.)
-- ============================================================

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

-- Açık (open) vaka benzersizliği uygulama katmanında + keyed lock ile
-- zaten sağlanıyor; partial unique index yalnızca mevcut duplicate açık
-- kayıt yoksa eklenir (varsa sessizce atlanır, hata vermez).
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

-- ============================================================
-- 2) CommunicationMessage — İletişim Merkezi tablosu (yeni)
-- ============================================================

CREATE TABLE IF NOT EXISTS "CommunicationMessage" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "CommunicationMessage_tenantId_idempotencyKey_key"
  ON "CommunicationMessage"("tenantId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "CommunicationMessage_tenantId_status_idx"
  ON "CommunicationMessage"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "CommunicationMessage_tenantId_resourceType_resourceId_idx"
  ON "CommunicationMessage"("tenantId", "resourceType", "resourceId");

CREATE INDEX IF NOT EXISTS "CommunicationMessage_tenantId_channel_messageType_idx"
  ON "CommunicationMessage"("tenantId", "channel", "messageType");

-- Postgres'te "ADD CONSTRAINT IF NOT EXISTS" yok; aynı etkiyi veren güvenli
-- kontrol bloğu — FK zaten varsa sessizce atlar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CommunicationMessage_tenantId_fkey'
  ) THEN
    ALTER TABLE "CommunicationMessage"
      ADD CONSTRAINT "CommunicationMessage_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 3) SmsInboundEvent — gelen SMS kayıt tablosu (yeni)
--    (prisma/migrations/20260814140000_sms_inbound_event ile birebir aynı,
--    zaten idempotent.)
-- ============================================================

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
