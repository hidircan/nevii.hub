-- E-posta değiştirme doğrulama token'ları (2026-09-11) — hesap sahibinin
-- kendi e-postasını güvenli akışla değiştirmesi (bkz.
-- src/lib/auth/email-change.ts, docs/agent-memory/PROJECT_STATE.md).
--
-- Şifre sıfırlama token'larından AYRI tablo (amaç karışmaz). Tüm kolonlar
-- nullable DEĞİL ama satır ömrü kısadır (24s TTL + tek kullanımlık).
-- Rollback: tablo DROP TABLE ile kaldırılabilir; uygulama json/memory
-- moda düşer.
--
-- BU MIGRATION HİÇBİR shared/staging/production/test VERİTABANINA
-- UYGULANMADI — yalnızca dosya olarak eklendi.

CREATE TABLE IF NOT EXISTS "EmailChangeToken" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "newEmail" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailChangeToken_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EmailChangeToken_tokenHash_idx" ON "EmailChangeToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmailChangeToken_userId_idx" ON "EmailChangeToken"("userId");
