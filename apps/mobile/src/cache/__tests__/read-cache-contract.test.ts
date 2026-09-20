/**
 * Faz 7 — offline cache güvenlik sözleşmeleri (statik).
 *
 * - Logout cache temizler (tenant+user ad-alanlı).
 * - Ekranlar cache'li hook + durum rozeti kullanır.
 * - Yazma kuyruğu / offline mutation YOK (apiPost geçidi yok).
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const SRC = path.join(__dirname, "..", "..");

async function src(rel: string): Promise<string> {
  return fs.readFile(path.join(SRC, rel), "utf-8");
}

describe("logout cache temizliği", () => {
  it("auth-context logout clearUserCache çağırır", async () => {
    const content = await src("auth/auth-context.tsx");
    expect(content).toContain('from "../cache/cache-store"');
    expect(content).toMatch(/await clearUserCache\(user\.tenantId, signedOutUserId\)/);
  });
});

describe("ekran entegrasyonu", () => {
  const screens = [
    "features/student-scope/lessons-screen.tsx",
    "features/student-scope/homework-screen.tsx",
    "features/student-scope/attendance-report-screen.tsx",
    "features/student-scope/payments-screen.tsx",
    "features/student-scope/makeup-screen.tsx",
    "features/student-scope/materials-screen.tsx",
    "features/student-scope/home-screen.tsx",
    "features/student-scope/gelisim-screen.tsx",
  ];
  for (const screen of screens) {
    it(`${screen}: cache'li hook + rozet`, async () => {
      const content = await src(screen);
      expect(content).toContain("useCachedApiGet");
      expect(content).toMatch(/<CacheStatus cachedAt=\{[a-z]+\.cachedAt\} isStale=\{[a-z]+\.isStale\} \/>/);
    });
  }
});

describe("bildirim merkezi ilk-sayfa cache'i", () => {
  it("ilk sayfa okunur/yazılır, okundu-işaretleme ağa gider", async () => {
    const content = await src("../app/notifications.tsx");
    expect(content).toMatch(/readCacheEntry<NotificationsResponse>/);
    expect(content).toMatch(/writeCacheEntry\(getProductionBackend\(\), input, res\.data\)/);
    expect(content).toMatch(/apiPost\("\/api\/v1\/notifications", \{ notificationId/);
    expect(content).toMatch(/<CacheStatus cachedAt=\{cacheInfo\.cachedAt\} isStale=\{cacheInfo\.isStale\} \/>/);
  });
});

describe("yazma kuyruğu yasağı", () => {
  it("cache modülünde apiPost/apiPut/apiPatch/apiDelete geçidi YOK", async () => {
    for (const f of ["cache/cache-keys.ts", "cache/cache-store.ts", "cache/use-cached-api.ts"]) {
      const content = await src(f);
      expect(content, f).not.toMatch(/apiPost|apiPut|apiPatch|apiDelete/);
    }
  });

  it("yoklama/ödeme ekranları cache'li hook KULLANMAZ", async () => {
    const yoklama = await src("../app/(admin)/islemler/yoklama.tsx");
    expect(yoklama).not.toContain("useCachedApiGet");
    const tahsilat = await src("../app/(admin)/islemler/tahsilat.tsx");
    expect(tahsilat).not.toContain("useCachedApiGet");
  });
});
