-- CreateTable
CREATE TABLE "ProfilePhoto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileData" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfilePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfilePhoto_tenantId_ownerType_ownerId_idx" ON "ProfilePhoto"("tenantId", "ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfilePhoto_tenantId_ownerType_ownerId_key" ON "ProfilePhoto"("tenantId", "ownerType", "ownerId");

-- AddForeignKey
ALTER TABLE "ProfilePhoto" ADD CONSTRAINT "ProfilePhoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
