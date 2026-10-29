-- 2026-10-23 — Grup dersi (eklemeli): yeni tablo + Lesson'a iki nullable kolon ve indeksler.
-- Mevcut satırlar değişmez; backfill YOK. KODDAN ÖNCE uygulanmalı (P2022 riski).

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN "groupLessonId" TEXT;
ALTER TABLE "Lesson" ADD COLUMN "groupSessionId" TEXT;

-- CreateTable
CREATE TABLE "GroupLesson" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "monthlyFee" INTEGER NOT NULL,
    "recurrence" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "startsOn" TEXT NOT NULL,
    "endsOn" TEXT NOT NULL,
    "sessionOverrides" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupLesson_tenantId_status_idx" ON "GroupLesson"("tenantId", "status");
CREATE INDEX "Lesson_tenantId_groupSessionId_idx" ON "Lesson"("tenantId", "groupSessionId");
CREATE INDEX "Lesson_tenantId_groupLessonId_idx" ON "Lesson"("tenantId", "groupLessonId");

-- AddForeignKey
ALTER TABLE "GroupLesson" ADD CONSTRAINT "GroupLesson_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
