-- Additive. Veri değiştirmez, satır silmez, kolon düşürmez. Tüm kolonlar NULL kabul eder.
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;
ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "criticalActionPasswordHash" TEXT;
ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "criticalActionPasswordSetAt" TIMESTAMP(3);
ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "criticalActionPasswordSetBy" TEXT;
