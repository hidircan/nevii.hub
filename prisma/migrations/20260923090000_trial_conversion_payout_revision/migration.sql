-- Additive. Veri değiştirmez, satır silmez, kolon düşürmez. Yeni kolonlar NULL kabul eder;
-- tek NOT NULL kolon ("revisionCount") sabit varsayılanla gelir (PG11+ metadata-only, tablo yeniden yazılmaz).

-- H · Deneme → öğrenci dönüşümü: kim, ne zaman.
ALTER TABLE "TrialLesson" ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMP(3);
ALTER TABLE "TrialLesson" ADD COLUMN IF NOT EXISTS "convertedByUserId" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "convertedFromTrialId" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "convertedByUserId" TEXT;

-- K · Hakediş revizyonu: orijinal hesap korunur, satır düzeltmeleri + revizyon künyesi.
ALTER TABLE "TeacherPayout" ADD COLUMN IF NOT EXISTS "originalTotalMinutes" INTEGER;
ALTER TABLE "TeacherPayout" ADD COLUMN IF NOT EXISTS "originalTotalAmount" DOUBLE PRECISION;
ALTER TABLE "TeacherPayout" ADD COLUMN IF NOT EXISTS "lineOverrides" JSONB;
ALTER TABLE "TeacherPayout" ADD COLUMN IF NOT EXISTS "revisionCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TeacherPayout" ADD COLUMN IF NOT EXISTS "revisedAt" TIMESTAMP(3);
ALTER TABLE "TeacherPayout" ADD COLUMN IF NOT EXISTS "revisedByUserId" TEXT;
ALTER TABLE "TeacherPayout" ADD COLUMN IF NOT EXISTS "revisionReason" TEXT;

-- L · Denetim kaydı saklama/temizleme sorgusu (createdAt < eşik) tenant filtresiz tarandığında.
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
