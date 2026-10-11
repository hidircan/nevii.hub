-- AccountDeletionRequest — hesap silme talepleri (additive, mevcut tabloya dokunmaz).
-- Uygulama: npx prisma migrate deploy (prod) — bu dosya IF NOT EXISTS desenlidir.

CREATE TABLE IF NOT EXISTS "AccountDeletionRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "decidedBy" TEXT,
  "decisionNote" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AccountDeletionRequest_tenantId_userId_idx"
  ON "AccountDeletionRequest"("tenantId", "userId");

CREATE INDEX IF NOT EXISTS "AccountDeletionRequest_tenantId_status_idx"
  ON "AccountDeletionRequest"("tenantId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AccountDeletionRequest_tenantId_fkey'
  ) THEN
    ALTER TABLE "AccountDeletionRequest"
      ADD CONSTRAINT "AccountDeletionRequest_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
