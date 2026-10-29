-- 2026-10-05 — Herkese açık deneme dersi başvurusu. Yalnız yeni tablo ekler (eklemeli, mevcut veriye dokunmaz).
-- CreateTable
CREATE TABLE "TrialApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "parentName" TEXT,
    "age" INTEGER,
    "instrument" TEXT NOT NULL,
    "branchId" TEXT,
    "preferredSlots" JSONB,
    "availabilityNote" TEXT,
    "note" TEXT,
    "kvkkConsentAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "staffNote" TEXT,
    "trialLessonId" TEXT,
    "handledByUserId" TEXT,
    "handledAt" TIMESTAMP(3),
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrialApplication_tenantId_status_idx" ON "TrialApplication"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TrialApplication_tenantId_createdAt_idx" ON "TrialApplication"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "TrialApplication" ADD CONSTRAINT "TrialApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Canlıdaki diğer tüm tablolarla aynı: RLS açık (uygulama tablo sahibi `postgres` ile bağlanır, etkilenmez).
ALTER TABLE "TrialApplication" ENABLE ROW LEVEL SECURITY;
