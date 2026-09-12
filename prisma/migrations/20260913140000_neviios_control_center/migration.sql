-- NeviiOS Control Center → NeviiHub birleşimi (2026-09-12). YALNIZ ADDITIVE.
-- Oluşturan: `prisma migrate diff --from-schema <birleşim öncesi şema> --to-schema prisma/schema.prisma --script`
-- (çevrimdışı; hiçbir DB'ye bağlanılmadı) + idempotent hale getirildi (IF NOT EXISTS).
-- UYGULANMADI. Kaynak worktree'deki 20260826*/20260911120000_neviios*/20260912120000_*/20260913120000_*
-- migration'ları bu repoya ALINMADI (sıralama çakışması); içerikleri bu tek dosyada toplandı.
-- Deploy sırası: bu migration → kod. Kod, UserSession tablosu yokken sid'li token'ları fail-closed reddeder.
-- Rollback (VERİ KAYBI): yeni tabloları DROP TABLE; yeni kolonları DROP COLUMN. Önce yedek alın;
-- "deletedAt" düşürülürse silinmiş kullanıcılar yeniden görünür, "sessionsRevokedAt" düşürülürse
-- iptal edilmiş oturumlar yeniden geçerli olabilir.
-- PasswordResetToken."createdBy" NULLABLE eklendi: mevcut (şifremi unuttum) satırları etkilenmez.

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "colorPrimary" TEXT NOT NULL DEFAULT '#6d28d9',
ADD COLUMN IF NOT EXISTS "contactEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT 'TR',
ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'TRY',
ADD COLUMN IF NOT EXISTS "draftJson" JSONB,
ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'tr',
ADD COLUMN IF NOT EXISTS "lifecycle" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS "logoUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "planKey" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS "provisionError" TEXT,
ADD COLUMN IF NOT EXISTS "shortName" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul';

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "displayName" TEXT,
ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "sessionsRevokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PasswordResetToken" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SettingOverride" (
    "id" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettingOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FeatureFlagOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "flagKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlagOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlatformAuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorTenantId" TEXT NOT NULL,
    "targetTenantId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "secretLast4" TEXT,
    "secretStored" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OwnerInvitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "role" TEXT,
    "branchIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProvisioningRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "error" TEXT,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvisioningRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserBranchAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserBranchAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupportAccessSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedBy" TEXT,

    CONSTRAINT "SupportAccessSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PolicyVersion" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "rollbackOfVersion" INTEGER,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TenantCustomRole" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "grants" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "TenantCustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserRoleAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokeReason" TEXT,
    "device" TEXT,
    "lastPath" TEXT,
    "lastAction" TEXT,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlatformRelease" (
    "id" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "manifest" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlatformDeployment" (
    "id" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "url" TEXT,
    "commitSha" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "releaseId" TEXT,
    "recordedBy" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SettingOverride_scopeType_scopeId_idx" ON "SettingOverride"("scopeType", "scopeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SettingOverride_key_idx" ON "SettingOverride"("key");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SettingOverride_scopeType_scopeId_key_key" ON "SettingOverride"("scopeType", "scopeId", "key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeatureFlagOverride_tenantId_idx" ON "FeatureFlagOverride"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FeatureFlagOverride_tenantId_flagKey_key" ON "FeatureFlagOverride"("tenantId", "flagKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformAuditEvent_targetTenantId_createdAt_idx" ON "PlatformAuditEvent"("targetTenantId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformAuditEvent_actorUserId_createdAt_idx" ON "PlatformAuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformAuditEvent_action_createdAt_idx" ON "PlatformAuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntegrationConnection_scopeType_scopeId_idx" ON "IntegrationConnection"("scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationConnection_scopeType_scopeId_provider_key" ON "IntegrationConnection"("scopeType", "scopeId", "provider");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OwnerInvitation_tenantId_createdAt_idx" ON "OwnerInvitation"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OwnerInvitation_email_idx" ON "OwnerInvitation"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProvisioningRun_tenantId_createdAt_idx" ON "ProvisioningRun"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserBranchAccess_tenantId_userId_idx" ON "UserBranchAccess"("tenantId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserBranchAccess_tenantId_branchId_idx" ON "UserBranchAccess"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupportAccessSession_tenantId_startedAt_idx" ON "SupportAccessSession"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupportAccessSession_actorUserId_startedAt_idx" ON "SupportAccessSession"("actorUserId", "startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PolicyVersion_scopeId_key_status_idx" ON "PolicyVersion"("scopeId", "key", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PolicyVersion_scopeId_key_version_key" ON "PolicyVersion"("scopeId", "key", "version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TenantCustomRole_tenantId_idx" ON "TenantCustomRole"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TenantCustomRole_tenantId_key_key" ON "TenantCustomRole"("tenantId", "key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserRoleAssignment_tenantId_userId_idx" ON "UserRoleAssignment"("tenantId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserRoleAssignment_roleId_idx" ON "UserRoleAssignment"("roleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserSession_userId_revokedAt_idx" ON "UserSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserSession_tenantId_lastSeenAt_idx" ON "UserSession"("tenantId", "lastSeenAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformRelease_product_environment_publishedAt_idx" ON "PlatformRelease"("product", "environment", "publishedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformDeployment_product_environment_createdAt_idx" ON "PlatformDeployment"("product", "environment", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_idempotencyKey_key" ON "Tenant"("idempotencyKey");

