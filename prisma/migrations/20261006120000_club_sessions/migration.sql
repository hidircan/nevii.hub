-- 2026-10-06 — Kulüp 2. aşama: Lesson'a nullable clubId/clubSessionId + indeks; Club'a gizleyerek silme kolonları (eklemeli; mevcut satırlar değişmez).
-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "clubId" TEXT,
ADD COLUMN     "clubSessionId" TEXT;

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT,
ADD COLUMN     "deletionReason" TEXT;

-- CreateIndex
CREATE INDEX "Lesson_tenantId_clubSessionId_idx" ON "Lesson"("tenantId", "clubSessionId");

