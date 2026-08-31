-- 2026-2027 sözleşme kaynağı Madde 8 — "aynı gün bildirilen iptal" kuralını
-- markAttendance'ın genel `markedAt` alanından AYRI, personelin açıkça
-- girdiği bir iptal-bildirimi kaydıyla güvenilir şekilde uygulamak için.
-- Tüm alanlar NULLABLE — legacy/mevcut satırlar bozulmaz, geriye dönük
-- backfill YAPILMAZ (eski genel devamsızlık kayıtlarının aslında "aynı gün
-- bildirilen iptal" olup olmadığı güvenilir şekilde bilinemez; bu görev bunu
-- UYDURMAZ, yalnızca bundan sonraki kayıtlar için alan açar).
--
-- BU MİGRATION HİÇBİR shared/staging/production VERİTABANINA UYGULANMADI —
-- yalnızca dosya olarak eklendi (bkz. docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md §5).
ALTER TABLE "Attendance" ADD COLUMN "cancellationSource" TEXT;
ALTER TABLE "Attendance" ADD COLUMN "cancellationNoticeAt" TIMESTAMP(3);
ALTER TABLE "Attendance" ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "Attendance" ADD COLUMN "cancellationEvidenceDocumentId" TEXT;
ALTER TABLE "Attendance" ADD COLUMN "telafiEligible" BOOLEAN;
