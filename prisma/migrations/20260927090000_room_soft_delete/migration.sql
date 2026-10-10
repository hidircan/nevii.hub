-- 8. tur (E): pasif odanın "silinmesi" soft delete'tir. Satır kalır ki geçmiş
-- ders/yoklama kayıtları oda adını göstermeye devam etsin (Lesson.roomId FK). Additive.
ALTER TABLE "Room" ADD COLUMN "deletedAt" TIMESTAMP(3);
