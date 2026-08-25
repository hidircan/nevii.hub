-- Faz 8 (docs/implementation-plans/notaplan-product-expansion.md) — genelleştirilmiş
-- KVKK açık rıza yönetimi: versiyonlu hukuki metin (ConsentTextVersion, append-only)
-- + rıza kayıtları (KvkkConsent, SocialMediaConsent ile aynı iskelet) + tenant
-- ayarında kısıtlanan özellik listesi (School.consentSettings, additive/nullable).

ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "consentSettings" JSONB;

CREATE TABLE IF NOT EXISTS "ConsentTextVersion" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "consentType"   TEXT NOT NULL,
  "version"       INTEGER NOT NULL,
  "bodyText"      TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "createdBy"     TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConsentTextVersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConsentTextVersion_tenantId_consentType_effectiveFrom_idx" ON "ConsentTextVersion" ("tenantId", "consentType", "effectiveFrom");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ConsentTextVersion_tenantId_consentType_version_key'
  ) THEN
    ALTER TABLE "ConsentTextVersion"
      ADD CONSTRAINT "ConsentTextVersion_tenantId_consentType_version_key" UNIQUE ("tenantId", "consentType", "version");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConsentTextVersion_tenantId_fkey') THEN
    ALTER TABLE "ConsentTextVersion"
      ADD CONSTRAINT "ConsentTextVersion_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "KvkkConsent" (
  "id"               TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "subjectType"      TEXT NOT NULL,
  "subjectId"        TEXT NOT NULL,
  "consentType"      TEXT NOT NULL,
  "textVersionId"    TEXT NOT NULL,
  "acceptedAt"       TIMESTAMP(3) NOT NULL,
  "channel"          TEXT NOT NULL,
  "withdrawnAt"      TIMESTAMP(3),
  "withdrawalReason" TEXT,
  "deviceInfo"       JSONB,
  "createdBy"        TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KvkkConsent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "KvkkConsent_tenantId_subjectType_subjectId_idx" ON "KvkkConsent" ("tenantId", "subjectType", "subjectId");
CREATE INDEX IF NOT EXISTS "KvkkConsent_tenantId_consentType_idx" ON "KvkkConsent" ("tenantId", "consentType");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KvkkConsent_tenantId_fkey') THEN
    ALTER TABLE "KvkkConsent"
      ADD CONSTRAINT "KvkkConsent_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
