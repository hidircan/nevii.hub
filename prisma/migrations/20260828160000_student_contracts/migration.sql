-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "contractId" TEXT,
ADD COLUMN     "installmentSequence" INTEGER;

-- CreateTable
CREATE TABLE "StudentContract" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "contractType" TEXT NOT NULL,
    "previousContractId" TEXT,
    "documentInstanceId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "contractDataSnapshot" JSONB NOT NULL,
    "programmeName" TEXT NOT NULL,
    "enrollmentStartDate" TIMESTAMP(3) NOT NULL,
    "enrollmentEndDate" TIMESTAMP(3) NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "monthlyAmount" INTEGER NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "totalContractAmount" INTEGER NOT NULL,
    "depositAmount" INTEGER,
    "paymentMethod" TEXT,
    "signatoryFullName" TEXT NOT NULL,
    "signatoryNationalId" TEXT,
    "signatoryAddress" TEXT,
    "signatoryRelationship" TEXT,
    "createdBy" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "printedBy" TEXT,
    "printedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentContract_documentInstanceId_key" ON "StudentContract"("documentInstanceId");

-- CreateIndex
CREATE INDEX "StudentContract_tenantId_studentId_idx" ON "StudentContract"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "StudentContract_tenantId_status_idx" ON "StudentContract"("tenantId", "status");

-- CreateIndex
CREATE INDEX "StudentContract_previousContractId_idx" ON "StudentContract"("previousContractId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentContract_tenantId_contractNumber_key" ON "StudentContract"("tenantId", "contractNumber");

-- CreateIndex
CREATE INDEX "Payment_tenantId_contractId_idx" ON "Payment"("tenantId", "contractId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "StudentContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContract" ADD CONSTRAINT "StudentContract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContract" ADD CONSTRAINT "StudentContract_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContract" ADD CONSTRAINT "StudentContract_previousContractId_fkey" FOREIGN KEY ("previousContractId") REFERENCES "StudentContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

