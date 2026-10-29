-- 2026-10-21 (owner) — ayrı "öğretmen yoklaması" kaldırıldı. Öğretmen performansının tek verisi
-- iptal/telafideki "Öğretmen kaynaklı" kaynak (Lesson.disruptionSource = 'teacher').
-- Mevcut öğretmen yoklaması kayıtları KASITLI olarak silinir (owner talebi). Kod canlıya alındıktan
-- SONRA uygulanmalı (eski kod bu kolonları okur).

ALTER TABLE "Lesson" DROP COLUMN IF EXISTS "teacherAttendanceStatus";
ALTER TABLE "Lesson" DROP COLUMN IF EXISTS "teacherAttendanceAt";
ALTER TABLE "Lesson" DROP COLUMN IF EXISTS "teacherAttendanceBy";
ALTER TABLE "Lesson" DROP COLUMN IF EXISTS "teacherAttendanceNote";
