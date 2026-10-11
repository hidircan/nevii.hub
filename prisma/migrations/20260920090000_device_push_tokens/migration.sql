-- DevicePushToken — push bildirim cihaz token deposu (additive, mevcut tabloya dokunmaz).
-- Uygulama: npx prisma migrate deploy (prod) — bu dosya IF NOT EXISTS desenlidir.

CREATE TABLE IF NOT EXISTS "DevicePushToken" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "expoPushToken" TEXT NOT NULL,
  "appVariant" TEXT NOT NULL DEFAULT 'production',
  "deviceId" TEXT,
  "permission" TEXT NOT NULL DEFAULT 'undetermined',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DevicePushToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DevicePushToken_tenantId_userId_expoPushToken_key"
  ON "DevicePushToken"("tenantId", "userId", "expoPushToken");

CREATE INDEX IF NOT EXISTS "DevicePushToken_tenantId_userId_idx"
  ON "DevicePushToken"("tenantId", "userId");

CREATE INDEX IF NOT EXISTS "DevicePushToken_tenantId_userId_enabled_idx"
  ON "DevicePushToken"("tenantId", "userId", "enabled");
