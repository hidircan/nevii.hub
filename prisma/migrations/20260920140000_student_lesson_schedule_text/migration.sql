-- K — Kayıtta seçilen ders gün/saatleri kalıcı hale getirildi.
--
-- KÖK NEDEN: `createStudentTool` `lessonDays`i yalnız ilk tahsilat tutarını
-- hesaplamak için kullanıp SÜZÜYORDU; değer hiçbir tabloya yazılmıyordu.
-- Kullanıcı aynı bilgiyi kayıt → sözleşme → ders programı akışında üç kez
-- giriyordu ve üçü birbirini doğrulamıyordu.
--
-- Additive: yeni, nullable kolon. Mevcut satırlar etkilenmez, veri kaybı yok.
-- Geri alma: ALTER TABLE "Student" DROP COLUMN "lessonScheduleText";

ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "lessonScheduleText" TEXT;
