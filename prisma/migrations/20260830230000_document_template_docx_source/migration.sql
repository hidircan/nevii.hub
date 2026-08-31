-- P0 (2026-08-30, DOCX-öncelikli şablon iş akışı) — DocumentTemplate'e
-- yüklenen ORİJİNAL .docx dosyasını (base64) saklamak için nullable alanlar.
-- `bodyHtml` mammoth ile üretilen bir HTML önizlemesidir; DOCX'in kayıpsız
-- karşılığı DEĞİLDİR — asıl kaynak bu alanlarda saklanan orijinal dosyadır.
-- Tüm alanlar NULLABLE — mevcut/manuel HTML şablonları etkilenmez.
--
-- BU MİGRATION HİÇBİR shared/staging/production VERİTABANINA UYGULANMADI —
-- yalnızca dosya olarak eklendi.
ALTER TABLE "DocumentTemplate" ADD COLUMN "sourceFileData" TEXT;
ALTER TABLE "DocumentTemplate" ADD COLUMN "sourceFileName" TEXT;
ALTER TABLE "DocumentTemplate" ADD COLUMN "sourceMimeType" TEXT;
ALTER TABLE "DocumentTemplate" ADD COLUMN "sourceUploadedAt" TIMESTAMP(3);
ALTER TABLE "DocumentTemplate" ADD COLUMN "sourceUploadedById" TEXT;
