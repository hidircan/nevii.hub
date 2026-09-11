-- P0 personel onboarding revizyonu (2026-09-11) — detaylı özlük/iletişim
-- kaydı, rol ataması ve portal davet süreci için kalıcı StaffMember
-- kolonları (bkz. src/lib/types.ts StaffMember, docs/agent-memory/PROJECT_STATE.md).
--
-- - StaffMember.city: il (açık adresten ayrı, opsiyonel).
-- - StaffMember.district: ilçe (açık adresten ayrı, opsiyonel).
-- - StaffMember.emergencyContactRelationship: yakınlık derecesi (serbest metin).
-- - StaffMember.portalUserId: bağlı SCHOOL_ADMIN User satırı (yoksa erişim yok).
-- - StaffMember.portalInvitedAt: son davet e-postası zamanı.
--
-- Tümü nullable/additive: mevcut hiçbir StaffMember satırı etkilenmez,
-- backfill GEREKTİRMEZ; NULL okunduğunda uygulama "belirtilmemiş"/"erişim
-- yok" gösterir. Özel nitelikli kişisel veri, IBAN veya maaş kolonu YOKTUR
-- (bilinçli olarak eklenmedi).
-- Rollback: beş kolon DROP COLUMN ile kaldırılabilir; uygulama kodu
-- kolonlar yokken undefined okur/yazar (json/memory mod etkilenmez).
--
-- BU MIGRATION HİÇBİR shared/staging/production/test VERİTABANINA
-- UYGULANMADI — yalnızca dosya olarak eklendi.

ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "district" TEXT;
ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "emergencyContactRelationship" TEXT;
ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "portalUserId" TEXT;
ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "portalInvitedAt" TIMESTAMP(3);
