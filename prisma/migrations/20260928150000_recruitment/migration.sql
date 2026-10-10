-- IK / ise alim modulu (feat/ik-recruitment, 2026-09-28).
-- YALNIZ YENI TABLOLAR — mevcut tablo/veriye DOKUNMAZ (additive).
-- Rollback: asagidaki 8 tabloyu DROP TABLE ile kaldirmak yeterlidir
-- (yalniz IK verisi kaybolur; diger moduller etkilenmez).

-- CreateTable
CREATE TABLE "RecruitmentJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'teacher',
    "instruments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "branchId" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'part_time',
    "location" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "requirements" TEXT NOT NULL DEFAULT '',
    "benefits" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "jobId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'teacher',
    "stage" TEXT NOT NULL DEFAULT 'new',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "instruments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "experienceYears" INTEGER,
    "teachingYears" INTEGER,
    "educationLevel" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'website',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ratingAvg" DOUBLE PRECISION,
    "profile" JSONB,
    "cvFileId" TEXT,
    "kvkkConsentAt" TIMESTAMP(3),
    "kvkkTextVersion" TEXT NOT NULL DEFAULT '',
    "retentionUntil" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "hiredTeacherId" TEXT,
    "hiredStaffId" TEXT,
    "lastStageChangeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruitmentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentActivity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "meta" JSONB,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruitmentActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentInterview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'interview',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "location" TEXT NOT NULL DEFAULT '',
    "interviewers" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "notes" TEXT NOT NULL DEFAULT '',
    "invitationSentAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentInterview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentEvaluation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "interviewId" TEXT,
    "evaluatorId" TEXT,
    "evaluatorName" TEXT NOT NULL DEFAULT '',
    "scores" JSONB NOT NULL,
    "overall" DOUBLE PRECISION NOT NULL,
    "recommendation" TEXT NOT NULL DEFAULT 'neutral',
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruitmentEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentEmailTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'custom',
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "systemKey" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentEmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentSettings" (
    "tenantId" TEXT NOT NULL,
    "careerPageEnabled" BOOLEAN NOT NULL DEFAULT false,
    "careerPageIntro" TEXT NOT NULL DEFAULT '',
    "kvkkText" TEXT NOT NULL DEFAULT '',
    "kvkkTextVersion" TEXT NOT NULL DEFAULT 'v1',
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "autoAcknowledge" BOOLEAN NOT NULL DEFAULT true,
    "retentionMonths" INTEGER NOT NULL DEFAULT 12,
    "scorecardCriteria" JSONB,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentSettings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE INDEX "RecruitmentJob_tenantId_status_idx" ON "RecruitmentJob"("tenantId", "status");
CREATE UNIQUE INDEX "RecruitmentJob_tenantId_slug_key" ON "RecruitmentJob"("tenantId", "slug");
CREATE INDEX "RecruitmentApplication_tenantId_stage_idx" ON "RecruitmentApplication"("tenantId", "stage");
CREATE INDEX "RecruitmentApplication_tenantId_jobId_idx" ON "RecruitmentApplication"("tenantId", "jobId");
CREATE INDEX "RecruitmentApplication_tenantId_email_idx" ON "RecruitmentApplication"("tenantId", "email");
CREATE UNIQUE INDEX "RecruitmentApplication_tenantId_seq_key" ON "RecruitmentApplication"("tenantId", "seq");
CREATE INDEX "RecruitmentFile_tenantId_applicationId_idx" ON "RecruitmentFile"("tenantId", "applicationId");
CREATE INDEX "RecruitmentActivity_tenantId_applicationId_createdAt_idx" ON "RecruitmentActivity"("tenantId", "applicationId", "createdAt");
CREATE INDEX "RecruitmentInterview_tenantId_scheduledAt_idx" ON "RecruitmentInterview"("tenantId", "scheduledAt");
CREATE INDEX "RecruitmentInterview_tenantId_applicationId_idx" ON "RecruitmentInterview"("tenantId", "applicationId");
CREATE INDEX "RecruitmentEvaluation_tenantId_applicationId_idx" ON "RecruitmentEvaluation"("tenantId", "applicationId");
CREATE INDEX "RecruitmentEmailTemplate_tenantId_kind_idx" ON "RecruitmentEmailTemplate"("tenantId", "kind");

-- AddForeignKey
ALTER TABLE "RecruitmentJob" ADD CONSTRAINT "RecruitmentJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentApplication" ADD CONSTRAINT "RecruitmentApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentApplication" ADD CONSTRAINT "RecruitmentApplication_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "RecruitmentJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecruitmentFile" ADD CONSTRAINT "RecruitmentFile_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RecruitmentApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentActivity" ADD CONSTRAINT "RecruitmentActivity_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RecruitmentApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentInterview" ADD CONSTRAINT "RecruitmentInterview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RecruitmentApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentEvaluation" ADD CONSTRAINT "RecruitmentEvaluation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RecruitmentApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentEmailTemplate" ADD CONSTRAINT "RecruitmentEmailTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentSettings" ADD CONSTRAINT "RecruitmentSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
