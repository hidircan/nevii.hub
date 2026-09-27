-- 9. tur (2026-09-28). Yalnız EKLEMELİ, hepsi nullable; mevcut satırlar değişmez,
-- veri taşıma/backfill yok. Geri dönüş: kolonlar okunmazsa etkisizdir; gerekirse
-- DROP COLUMN ile kaldırılabilir (bu kolonlara yazılmış kaynak/silme bilgisi kaybolur).

-- İptal/Telafi kaynağı — öğretmen katılımı (teacherAttendanceStatus) ve ders statüsünden ayrı.
ALTER TABLE "Lesson" ADD COLUMN "disruptionSource" TEXT;
ALTER TABLE "Lesson" ADD COLUMN "disruptionNote" TEXT;
ALTER TABLE "Lesson" ADD COLUMN "disruptionAt" TIMESTAMP(3);
ALTER TABLE "Lesson" ADD COLUMN "disruptionBy" TEXT;

-- İş takibi: geri alınabilir silme.
ALTER TABLE "Task" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "deletedByUserId" TEXT;
ALTER TABLE "Task" ADD COLUMN "deletionReason" TEXT;
