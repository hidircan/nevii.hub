-- K — Sözleşmeden üretilen ders serisi bağlantısı.
--
-- Sözleşme onaylandıktan sonra ders programı tek tıkla üretilebiliyor.
-- Üretilen seri, kaynağı olan sözleşmeyi taşır ki:
--   * "bu sözleşmeden kaç ders üretildi?" sorusu cevaplanabilsin,
--   * sözleşme iptalinde kullanıcıya "N gelecek ders var, ne yapılsın?"
--     diye SORULABİLSİN (otomatik/sessiz silme YAPILMAZ).
--
-- FK tanımlanmadı: sözleşme kaydı arşivlense bile ders geçmişi sorgulanabilir
-- kalmalıdır (AiAuditLog/AuditLog ile aynı gerekçe).
--
-- Additive: yeni, nullable kolon + index. Mevcut seriler etkilenmez.
-- Geri alma:
--   DROP INDEX IF EXISTS "LessonSeries_contractId_idx";
--   ALTER TABLE "LessonSeries" DROP COLUMN "contractId";

ALTER TABLE "LessonSeries" ADD COLUMN IF NOT EXISTS "contractId" TEXT;
CREATE INDEX IF NOT EXISTS "LessonSeries_contractId_idx" ON "LessonSeries"("contractId");
