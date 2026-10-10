-- 2026-10-09 — çoklu branş kaydı: ödeme satırının branş kaydı (Student.enrollments[].id).
-- Yalnız nullable kolon + indeks ekler (eklemeli, geriye uyumlu): eski kod bu kolonu okumaz/yazmaz;
-- NULL = eski kayıt (tek branşlı öğrencide o branşa aittir). Veri DEĞİŞTİRMEZ — açık bağlar
-- scripts/backfill-enrollment-links.ts ile (önce kuru çalıştırma, sonra onaylı --apply) yazılır.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "enrollmentId" TEXT;
CREATE INDEX IF NOT EXISTS "Payment_tenantId_studentId_enrollmentId_idx" ON "Payment"("tenantId", "studentId", "enrollmentId");
