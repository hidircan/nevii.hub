-- C — Günlük Özet (dashboard) kişisel ayarları.
--
-- Rol/şube farkındalıklı panel için kullanıcı bazlı varsayılan şube ve
-- gizlenen bölüm listesi. Yalnız GÖRÜNÜRLÜK tercihidir; yetki/kapsam
-- kontrolünü ETKİLEMEZ (o her zaman oturumdaki tenant + rolden gelir).
--
-- Additive: yeni, nullable kolon. Mevcut satırlar etkilenmez, veri kaybı yok.
-- Geri alma: ALTER TABLE "UserPreference" DROP COLUMN "dashboardJson";

ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "dashboardJson" TEXT;
