-- 2026-10-05 — Kulüp sistemi (1. aşama). Yalnız yeni tablolar + Payment'a nullable kolon (eklemeli; mevcut satırlar değişmez).
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "clubMembershipId" TEXT;

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "branchId" TEXT,
    "maxMembers" INTEGER NOT NULL DEFAULT 10,
    "monthlyFee" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "teacherIds" JSONB NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubMembership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "monthlyFee" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedByUserId" TEXT,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ClubMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Club_tenantId_active_idx" ON "Club"("tenantId", "active");

-- CreateIndex
CREATE INDEX "ClubMembership_tenantId_clubId_idx" ON "ClubMembership"("tenantId", "clubId");

-- CreateIndex
CREATE INDEX "ClubMembership_tenantId_studentId_idx" ON "ClubMembership"("tenantId", "studentId");

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Canlıdaki diğer tüm tablolarla aynı: RLS açık (uygulama tablo sahibi `postgres` ile bağlanır, etkilenmez).
ALTER TABLE "Club" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClubMembership" ENABLE ROW LEVEL SECURITY;
