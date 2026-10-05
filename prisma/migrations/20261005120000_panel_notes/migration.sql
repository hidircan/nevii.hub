-- 2026-10-05 — Günlük Özet "Notlar". Yalnız yeni tablo ekler (eklemeli, mevcut veriye dokunmaz).
CREATE TABLE IF NOT EXISTS "PanelNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PanelNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PanelNote_tenantId_createdAt_idx" ON "PanelNote"("tenantId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "PanelNote" ADD CONSTRAINT "PanelNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Canlıdaki diğer tüm tablolarla aynı: RLS açık (uygulama tablo sahibi `postgres` ile bağlanır, etkilenmez;
-- Data API/anon rolü bu tabloya hiçbir koşulda erişemez).
ALTER TABLE "PanelNote" ENABLE ROW LEVEL SECURITY;
