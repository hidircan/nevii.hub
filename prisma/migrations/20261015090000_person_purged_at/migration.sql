-- 2026-10-15 — öğrenci/öğretmen kalıcı silme: korunan geçmişi olan kişi satırı anonimleştirilip işaretlenir.
-- Yalnız eklemeli, nullable kolon; mevcut satırlar etkilenmez. KODDAN ÖNCE uygulanmalı.
ALTER TABLE "Student" ADD COLUMN "purgedAt" TIMESTAMP(3);
ALTER TABLE "Teacher" ADD COLUMN "purgedAt" TIMESTAMP(3);
