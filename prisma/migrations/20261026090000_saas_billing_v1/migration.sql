-- SaaS abonelik katmanı V1 (kurum→NeviiHub).
-- YALNIZCA YENİ TABLOLAR; mevcut hiçbir tabloya/kolona dokunulmaz.
-- Öğrenci finansmanı (Payment/StudentContract/TeacherPayout) değişmez.
-- Geri dönüş: tablolar DROP TABLE ile kaldırılabilir (SaaS verisi kaybolur,
-- öğrenci/kurum verisi etkilenmez). Bu migration test/prod'a owner'ın açık
-- onayıyla ve hedef kanıtlandıktan sonra uygulanır.

-- ── SaasSubscription ──
CREATE TABLE IF NOT EXISTS "SaasSubscription" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "planKey" TEXT NOT NULL,
  "catalogVersion" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "billingInterval" TEXT NOT NULL DEFAULT 'monthly',
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "priceSnapshot" JSONB NOT NULL,
  "trialStartsAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "paidThrough" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "provider" TEXT NOT NULL DEFAULT 'iyzico',
  "executionModel" TEXT,
  "merchantAccount" TEXT NOT NULL DEFAULT '',
  "providerCustomerRef" TEXT,
  "providerSubscriptionRef" TEXT,
  "providerCardRef" TEXT,
  "providerLinks" JSONB,
  "billingTimeZone" TEXT NOT NULL DEFAULT 'UTC',
  "billingEmail" TEXT NOT NULL DEFAULT '',
  "billingUserIp" TEXT NOT NULL DEFAULT '',
  "lastWebhookAt" TIMESTAMP(3),
  "lastReconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SaasSubscription_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SaasSubscription_tenantId_key') THEN
    ALTER TABLE "SaasSubscription" ADD CONSTRAINT "SaasSubscription_tenantId_key" UNIQUE ("tenantId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SaasSubscription_status_idx" ON "SaasSubscription" ("status");
CREATE INDEX IF NOT EXISTS "SaasSubscription_trialEndsAt_idx" ON "SaasSubscription" ("trialEndsAt");
CREATE INDEX IF NOT EXISTS "SaasSubscription_currentPeriodEnd_idx" ON "SaasSubscription" ("currentPeriodEnd");
CREATE INDEX IF NOT EXISTS "SaasSubscription_executionModel_currentPeriodEnd_idx" ON "SaasSubscription" ("executionModel", "currentPeriodEnd");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SaasSubscription_tenantId_fkey') THEN
    ALTER TABLE "SaasSubscription"
      ADD CONSTRAINT "SaasSubscription_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── SaasCollectionAttempt ──
CREATE TABLE IF NOT EXISTS "SaasCollectionAttempt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "debtKey" TEXT,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "kind" TEXT NOT NULL DEFAULT 'charge',
  "attemptNo" INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT '',
  "merchantAccount" TEXT NOT NULL DEFAULT '',
  "providerRef" TEXT,
  "providerEventId" TEXT,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "retryable" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SaasCollectionAttempt_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SaasCollectionAttempt_idempotencyKey_key') THEN
    ALTER TABLE "SaasCollectionAttempt" ADD CONSTRAINT "SaasCollectionAttempt_idempotencyKey_key" UNIQUE ("idempotencyKey");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SaasCollectionAttempt_tenantId_subscriptionId_idx" ON "SaasCollectionAttempt" ("tenantId", "subscriptionId");
CREATE INDEX IF NOT EXISTS "SaasCollectionAttempt_subscriptionId_periodStart_periodEnd_idx" ON "SaasCollectionAttempt" ("subscriptionId", "periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS "SaasCollectionAttempt_status_idx" ON "SaasCollectionAttempt" ("status");
CREATE INDEX IF NOT EXISTS "SaasCollectionAttempt_debtKey_idx" ON "SaasCollectionAttempt" ("debtKey");
CREATE INDEX IF NOT EXISTS "SaasCollectionAttempt_provider_providerRef_idx" ON "SaasCollectionAttempt" ("provider", "providerRef");
-- Dönem başına tek başarılı tahsilat (süreçler-arası garanti; refund/chargeback hariç).
CREATE UNIQUE INDEX IF NOT EXISTS "SaasCollectionAttempt_one_success_per_period"
  ON "SaasCollectionAttempt" ("subscriptionId", "periodStart", "periodEnd")
  WHERE "status" = 'succeeded' AND "kind" = 'charge';
-- Borç başına tek açık claim: iki paralel job aynı döneme iki çekim gönderemez.
-- (pending/uncertain satırı dururken ikinci claim INSERT'i P2002 ile düşer;
--  sağlayıcı idempotency'si varsayılmaz.)
CREATE UNIQUE INDEX IF NOT EXISTS "SaasCollectionAttempt_one_open_claim_per_debt"
  ON "SaasCollectionAttempt" ("subscriptionId", "periodStart")
  WHERE "kind" = 'charge' AND "status" IN ('pending', 'uncertain');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SaasCollectionAttempt_tenantId_fkey') THEN
    ALTER TABLE "SaasCollectionAttempt"
      ADD CONSTRAINT "SaasCollectionAttempt_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SaasCollectionAttempt_subscriptionId_fkey') THEN
    ALTER TABLE "SaasCollectionAttempt"
      ADD CONSTRAINT "SaasCollectionAttempt_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "SaasSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── SaasWebhookEvent ──
CREATE TABLE IF NOT EXISTS "SaasWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "tenantId" TEXT,
  "subscriptionId" TEXT,
  "payload" JSONB NOT NULL,
  "signatureValid" BOOLEAN NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'received',
  "processedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SaasWebhookEvent_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SaasWebhookEvent_eventId_key') THEN
    ALTER TABLE "SaasWebhookEvent" ADD CONSTRAINT "SaasWebhookEvent_eventId_key" UNIQUE ("eventId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SaasWebhookEvent_provider_eventType_idx" ON "SaasWebhookEvent" ("provider", "eventType");
CREATE INDEX IF NOT EXISTS "SaasWebhookEvent_status_idx" ON "SaasWebhookEvent" ("status");
CREATE INDEX IF NOT EXISTS "SaasWebhookEvent_tenantId_idx" ON "SaasWebhookEvent" ("tenantId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SaasWebhookEvent_tenantId_fkey') THEN
    ALTER TABLE "SaasWebhookEvent"
      ADD CONSTRAINT "SaasWebhookEvent_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── SaasCampaign ──
CREATE TABLE IF NOT EXISTS "SaasCampaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tenantId" TEXT,
  "code" TEXT NOT NULL,
  "discountType" TEXT NOT NULL,
  "amountMinor" INTEGER,
  "percent" INTEGER,
  "intervalScope" TEXT NOT NULL DEFAULT 'both',
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "maxRenewals" INTEGER,
  "maxRedemptions" INTEGER,
  "redeemedCount" INTEGER NOT NULL DEFAULT 0,
  "postCampaignNote" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SaasCampaign_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SaasCampaign_code_key') THEN
    ALTER TABLE "SaasCampaign" ADD CONSTRAINT "SaasCampaign_code_key" UNIQUE ("code");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SaasCampaign_tenantId_idx" ON "SaasCampaign" ("tenantId");
CREATE INDEX IF NOT EXISTS "SaasCampaign_active_idx" ON "SaasCampaign" ("active");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SaasCampaign_tenantId_fkey') THEN
    ALTER TABLE "SaasCampaign"
      ADD CONSTRAINT "SaasCampaign_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── SaasCheckoutInvitation ──
CREATE TABLE IF NOT EXISTS "SaasCheckoutInvitation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proposalId" TEXT,
  "proposalVersion" INTEGER,
  "campaignId" TEXT,
  "planKey" TEXT NOT NULL,
  "billingInterval" TEXT NOT NULL DEFAULT 'monthly',
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "displayAmountMinor" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "acceptedBy" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SaasCheckoutInvitation_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SaasCheckoutInvitation_tokenHash_key') THEN
    ALTER TABLE "SaasCheckoutInvitation" ADD CONSTRAINT "SaasCheckoutInvitation_tokenHash_key" UNIQUE ("tokenHash");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SaasCheckoutInvitation_tenantId_status_idx" ON "SaasCheckoutInvitation" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "SaasCheckoutInvitation_proposalId_proposalVersion_idx" ON "SaasCheckoutInvitation" ("proposalId", "proposalVersion");
CREATE INDEX IF NOT EXISTS "SaasCheckoutInvitation_expiresAt_idx" ON "SaasCheckoutInvitation" ("expiresAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SaasCheckoutInvitation_tenantId_fkey') THEN
    ALTER TABLE "SaasCheckoutInvitation"
      ADD CONSTRAINT "SaasCheckoutInvitation_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SaasCheckoutInvitation_campaignId_fkey') THEN
    ALTER TABLE "SaasCheckoutInvitation"
      ADD CONSTRAINT "SaasCheckoutInvitation_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "SaasCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── SaasTrialRequest ──
CREATE TABLE IF NOT EXISTS "SaasTrialRequest" (
  "id" TEXT NOT NULL,
  "institutionName" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "ownerEmail" TEXT NOT NULL,
  "ownerPhone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "tenantId" TEXT,
  "decidedBy" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SaasTrialRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SaasTrialRequest_status_idx" ON "SaasTrialRequest" ("status");
CREATE INDEX IF NOT EXISTS "SaasTrialRequest_ownerEmail_idx" ON "SaasTrialRequest" ("ownerEmail");
