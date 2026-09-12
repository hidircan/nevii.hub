-- P1 outbox (2026-09-11) — CommunicationMessage.templateKey: WhatsApp
-- onaylı-şablon anahtarı (dispatch'te 24s penceresi kapalıyken şablon
-- zorunluluğu denetimi; bkz. src/lib/communications/service.ts
-- evaluateDispatchReadiness, docs/agent-memory/PROJECT_STATE.md).
--
-- Nullable/additive: eski kayıtlar şablonsuz kalır (yer tutucu kontrolü
-- yine uygulanır). Rollback: kolon DROP COLUMN ile kaldırılabilir.
--
-- BU MIGRATION HİÇBİR shared/staging/production/test VERİTABANINA
-- UYGULANMADI — yalnızca dosya olarak eklendi.

ALTER TABLE "CommunicationMessage" ADD COLUMN IF NOT EXISTS "templateKey" TEXT;
