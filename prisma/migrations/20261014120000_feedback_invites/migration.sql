-- 2026-10-14 — Rapor portalı: kişiye özel öğretmen değerlendirme bağlantısı. Yalnız yeni tablo ekler (eklemeli, mevcut
-- veriye dokunmaz). SQL `prisma migrate diff` çıktısıdır; tekrar çalıştırılabilirlik + RLS satırı depo kuralıdır.
CREATE TABLE IF NOT EXISTS "FeedbackInvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "completedTeacherIds" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "FeedbackInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FeedbackInvite_tokenHash_key" ON "FeedbackInvite"("tokenHash");
CREATE INDEX IF NOT EXISTS "FeedbackInvite_tenantId_studentId_idx" ON "FeedbackInvite"("tenantId", "studentId");

DO $$ BEGIN
  ALTER TABLE "FeedbackInvite" ADD CONSTRAINT "FeedbackInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Canlıdaki diğer tablolarla aynı: RLS açık (uygulama tablo sahibiyle bağlanır, etkilenmez; Data API/anon erişemez).
ALTER TABLE "FeedbackInvite" ENABLE ROW LEVEL SECURITY;
