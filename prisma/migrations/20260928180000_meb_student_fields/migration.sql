-- MEB Paneli (2026-09-28) — ogrenci MEB donem/sinav alanlari.
-- YALNIZCA 4 NULLABLE KOLON EKLER (additive): mevcut tablo/veriye
-- DOKUNMAZ, backfill YOK, default YOK. Eski MEB kayitlari NULL okunur,
-- uygulama "belirtilmemis/Bilinmiyor" gosterir; ilk ilgili duzenlemede
-- tamamlanir. Genel enrollment/lesson tarihi kolonlarina DOKUNMAZ.
-- Rollback: asagidaki 4 kolonu DROP COLUMN ile kaldirmak yeterlidir
-- (yalniz MEB donem/sinav verisi kaybolur; diger moduller etkilenmez).

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "mebLevelStartDate" TIMESTAMP(3),
ADD COLUMN "mebLevelEndDate" TIMESTAMP(3),
ADD COLUMN "mebExamDate" TIMESTAMP(3),
ADD COLUMN "mebExamAttended" BOOLEAN;
