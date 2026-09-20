-- Evrak statü semantiği (2026-09-20)
--
-- KÖK NEDEN: `createDocumentInstance` varsayılanı "draft" idi. Üretilmiş,
-- referans numarası almış ve arşivde kalıcı olan her belge (özellikle öğrenci
-- kayıt sözleşmeleri) Evraklar Merkezi'nde "Taslak" görünüyordu. Bu hem yanlış
-- hem de güven kırıcıydı ("bu belge sonradan kaybolur mu?").
--
-- Bu migration YALNIZCA bir etiket düzeltmesidir: hiçbir satır silinmez,
-- hiçbir alan kaybolmaz, dosya/renderedHtml içerikleri değişmez. Sadece
-- statü değeri "draft" → "issued" olarak güncellenir.
--
-- Geri alma (rollback):
--   UPDATE "DocumentInstance" SET "status" = 'draft' WHERE "status" = 'issued';
-- (Yalnızca bu migration'dan hemen sonra anlamlıdır; sonradan gerçekten
--  "issued" olarak üretilen yeni belgeler de etkileneceği için dikkatle kullanın.)

UPDATE "DocumentInstance" SET "status" = 'issued' WHERE "status" = 'draft';

ALTER TABLE "DocumentInstance" ALTER COLUMN "status" SET DEFAULT 'issued';
