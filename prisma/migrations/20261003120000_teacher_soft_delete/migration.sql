-- Additive. Veri değiştirmez, satır silmez, kolon düşürmez. Tüm kolonlar NULL kabul eder.
ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT;
ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;
