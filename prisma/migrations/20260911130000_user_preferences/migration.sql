-- P1 kullanıcı workspace tercihleri (2026-09-11) — hesap bazlı kalıcı
-- store (`userId` + `tenantId`): tema/font/yoğunluk/sidebar/nav sırası/
-- son rota (bkz. src/lib/user-preferences.ts,
-- docs/agent-memory/PROJECT_STATE.md).
--
-- Tümü nullable/additive: kayıt yoksa uygulama varsayılanları kullanır,
-- backfill GEREKMEZ. Tercih verisi audit/finans/yetki verisiyle karışmaz
-- (ayrı tablo). Rollback: tablo DROP TABLE ile kaldırılabilir; uygulama
-- kodu tablo yokken varsayılanlara düşer (json/memory mod etkilenmez).
--
-- BU MIGRATION HİÇBİR shared/staging/production/test VERİTABANINA
-- UYGULANMADI — yalnızca dosya olarak eklendi.

CREATE TABLE IF NOT EXISTS "UserPreference" (
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "themeProfile" TEXT,
  "fontChoice" TEXT,
  "density" TEXT,
  "sidebarCollapsed" BOOLEAN,
  "navOrderJson" TEXT,
  "lastRoute" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId", "tenantId")
);
CREATE INDEX IF NOT EXISTS "UserPreference_tenantId_idx" ON "UserPreference"("tenantId");
