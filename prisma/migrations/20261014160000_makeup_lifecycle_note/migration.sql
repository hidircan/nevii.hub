-- Telafi yaşam döngüsü + Geldi notu. Additive ve nullable/default.
-- Geri dönüş: aşağıdaki üç satırı ters sırada DROP edin (kod bu kolonları seçmeden önce).
ALTER TABLE "Lesson" ADD COLUMN "studentAttendanceNote" TEXT;
ALTER TABLE "MakeupRequest" ADD COLUMN "changeLog" JSONB NOT NULL DEFAULT '[]';
CREATE INDEX "MakeupRequest_tenantId_status_expiresAt_idx" ON "MakeupRequest"("tenantId", "status", "expiresAt");
