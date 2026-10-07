-- 2026-10-07 — Grup dersi başvuru portalı. Yalnız EKLEME: nullable/varsayılanlı yeni kolonlar + yeni tablo.
-- Mevcut kulüpler başvuruya KAPALI kalır (applicationsOpen=false); mevcut üyelikler/ödemeler değişmez.
-- Geri alma: DROP TABLE "ClubApplication"; ALTER TABLE "Club" DROP COLUMN ... (aşağıdaki kolonlar);
--            ALTER TABLE "ClubMembership" DROP COLUMN "applicationId", DROP COLUMN "includedByMembershipIds";

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "applicationsOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "audience" TEXT,
ADD COLUMN     "endDate" TEXT,
ADD COLUMN     "feePeriod" TEXT NOT NULL DEFAULT 'monthly',
ADD COLUMN     "includedSolfegeClubId" TEXT,
ADD COLUMN     "includesText" TEXT,
ADD COLUMN     "internalNote" TEXT,
ADD COLUMN     "maxAge" INTEGER,
ADD COLUMN     "minAge" INTEGER,
ADD COLUMN     "scheduleText" TEXT,
ADD COLUMN     "startDate" TEXT,
ADD COLUMN     "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ClubMembership" ADD COLUMN     "applicationId" TEXT,
ADD COLUMN     "includedByMembershipIds" JSONB;

-- CreateTable
CREATE TABLE "ClubApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "branchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "waitlistRequested" BOOLEAN NOT NULL DEFAULT false,
    "participantName" TEXT NOT NULL,
    "birthDate" TEXT,
    "age" INTEGER,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "parentName" TEXT,
    "note" TEXT,
    "kvkkConsentAt" TIMESTAMP(3) NOT NULL,
    "kvkkTextVersionId" TEXT,
    "clubSnapshot" JSONB NOT NULL,
    "studentId" TEXT,
    "membershipId" TEXT,
    "solfegeMembershipId" TEXT,
    "solfegePending" BOOLEAN NOT NULL DEFAULT false,
    "staffNote" TEXT,
    "handledByUserId" TEXT,
    "handledAt" TIMESTAMP(3),
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubApplication_tenantId_createdAt_idx" ON "ClubApplication"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ClubApplication_tenantId_clubId_idx" ON "ClubApplication"("tenantId", "clubId");

-- CreateIndex
CREATE INDEX "ClubApplication_tenantId_status_idx" ON "ClubApplication"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ClubApplication_tenantId_phone_idx" ON "ClubApplication"("tenantId", "phone");

-- AddForeignKey
ALTER TABLE "ClubApplication" ADD CONSTRAINT "ClubApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Canlıdaki diğer tüm tablolarla aynı: RLS açık (uygulama tablo sahibi `postgres` ile bağlanır, etkilenmez).
ALTER TABLE "ClubApplication" ENABLE ROW LEVEL SECURITY;
