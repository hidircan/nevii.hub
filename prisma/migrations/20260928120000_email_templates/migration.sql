-- 10. tur is #2 — kurum bazli islem-e-postasi sablonlari (davet + sifre sifirlama).
-- YENI TABLO, mevcut veriye DOKUNMAZ (additive). Satirlar yalnizca admin sablon
-- yonetimini kullandiginda olusur; hic satir yoksa kod-ici varsayilan sablonlar
-- kullanilir. Rollback: DROP TABLE "EmailTemplate" (sablon ozellestirmeleri
-- kaybolur, e-posta akislari varsayilan sablonlara doner — veri kaybi yok).

CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'tr',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "subject" TEXT NOT NULL,
    "preheader" TEXT NOT NULL DEFAULT '',
    "introHtml" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "signatureHtml" TEXT NOT NULL DEFAULT '',
    "ctaLabel" TEXT NOT NULL DEFAULT '',
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailTemplate_tenantId_key_locale_version_key" ON "EmailTemplate"("tenantId", "key", "locale", "version");

CREATE INDEX "EmailTemplate_tenantId_key_locale_status_idx" ON "EmailTemplate"("tenantId", "key", "locale", "status");

ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
