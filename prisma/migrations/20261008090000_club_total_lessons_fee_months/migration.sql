-- 2026-10-08 — Kulüp: başvuranlara gösterilen "Toplam ders sayısı" + "Ödeme alınacak ay sayısı".
-- Yalnız EKLEME: iki nullable kolon. Mevcut kulüp/üyelik/ödeme satırlarına DOKUNMAZ (NULL = önceki davranış:
-- toplam ders "belirtilmemiş", aylık ücret üyelik sonlanana kadar). "Genç" yaş grubu için şema değişikliği gerekmez
-- (audience TEXT, kısıt yok).
-- Önkoşul: 20261007120000_club_applications uygulanmış olmalı (Club.feePeriod vb. orada eklenir).
-- Geri alma: ALTER TABLE "Club" DROP COLUMN "feeMonths", DROP COLUMN "totalLessons";

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "feeMonths" INTEGER,
ADD COLUMN     "totalLessons" INTEGER;
