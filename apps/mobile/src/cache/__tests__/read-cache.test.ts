import { describe, expect, it } from "vitest";
import {
  cacheClassForPath,
  cacheFileKey,
  cacheUserPrefix,
  hashPath,
  isEntryFresh,
  CACHE_TTL_MS,
} from "../cache-keys";
import {
  createMemoryBackend,
  readCacheEntry,
  removeCacheEntry,
  writeCacheEntry,
} from "../cache-store";

const INPUT = {
  tenantId: "t1",
  userId: "u1",
  persona: "parent",
  studentId: "s1",
  path: "/api/v1/students/s1/schedule?from=a&to=b",
};

describe("allowlist — yalnız okuma verisi", () => {
  it("kapsam içi yollar sınıflanır", () => {
    expect(cacheClassForPath("/api/v1/students/s1/schedule?from=a")).toBe("schedule");
    expect(cacheClassForPath("/api/v1/students/s1/homework")).toBe("homework");
    expect(cacheClassForPath("/api/v1/students/s1/teaching-materials")).toBe("reference");
    expect(cacheClassForPath("/api/v1/students/s1/attendance-summary")).toBe("attendance");
    expect(cacheClassForPath("/api/v1/students/s1/attendance-ledger?limit=10")).toBe("attendance");
    expect(cacheClassForPath("/api/v1/students/s1/makeup-ledger")).toBe("makeup");
    expect(cacheClassForPath("/api/v1/students/s1/payment-ledger?limit=200")).toBe("payments");
    expect(cacheClassForPath("/api/v1/payments/p1/receipt")).toBe("payments");
    expect(cacheClassForPath("/api/v1/notifications")).toBe("notifications");
    expect(cacheClassForPath("/api/v1/attendance-calendar/month?studentId=s1")).toBe("schedule");
  });

  it("hassas/akış yolları ASLA cache'lenmez", () => {
    const denied = [
      "/api/v1/payments/checkout",
      "/api/v1/payments/p1/pay",
      "/api/v1/students/s1/photo",
      "/api/v1/mobile/session",
      "/api/v1/mobile/push-tokens",
      "/api/v1/students/s1/documents/d1/download",
      "/api/v1/account/change-password",
      "/api/v1/students/s1/contracts",
      "",
    ];
    for (const p of denied) {
      expect(cacheClassForPath(p), p).toBeNull();
    }
  });

  it("TTL sınıfları makul aralıktadır", () => {
    expect(CACHE_TTL_MS.notifications).toBeLessThanOrEqual(5 * 60_000);
    expect(CACHE_TTL_MS.payments).toBeLessThanOrEqual(15 * 60_000);
    expect(CACHE_TTL_MS.reference).toBeLessThanOrEqual(60 * 60_000);
  });
});

describe("anahtar — tenant/user/persona/student izolasyonu", () => {
  it("deterministik + bağlam duyarlı", () => {
    const a = cacheFileKey(INPUT);
    expect(cacheFileKey({ ...INPUT })).toBe(a);
    expect(cacheFileKey({ ...INPUT, studentId: "s2" })).not.toBe(a);
    expect(cacheFileKey({ ...INPUT, userId: "u2" })).not.toBe(a);
    expect(cacheFileKey({ ...INPUT, tenantId: "t2" })).not.toBe(a);
    expect(cacheFileKey({ ...INPUT, persona: "student" })).not.toBe(a);
    expect(cacheFileKey({ ...INPUT, path: "/api/v1/students/s1/homework" })).not.toBe(a);
  });

  it("yol hash'i deterministik ve dosya-adı güvenlidir", () => {
    expect(hashPath(INPUT.path)).toBe(hashPath(INPUT.path));
    expect(hashPath(INPUT.path)).toMatch(/^[0-9a-f]{8}$/);
    expect(cacheFileKey(INPUT)).not.toContain("?");
    expect(cacheFileKey(INPUT)).not.toContain(" ");
  });

  it("kullanıcı öneki sürüm + tenant + user içerir", () => {
    expect(cacheUserPrefix("t1", "u1")).toContain("t1");
    expect(cacheUserPrefix("t1", "u1")).toContain("u1");
    expect(cacheFileKey(INPUT).startsWith(cacheUserPrefix("t1", "u1"))).toBe(true);
  });
});

describe("TTL tazeliği", () => {
  it("süre içindeki kayıt fresh, dışı stale", () => {
    const now = Date.now();
    expect(isEntryFresh({ v: 1, path: "p", savedAt: new Date(now - 60_000).toISOString(), data: 1 }, "schedule", now)).toBe(true);
    expect(isEntryFresh({ v: 1, path: "p", savedAt: new Date(now - 16 * 60_000).toISOString(), data: 1 }, "schedule", now)).toBe(false);
    expect(isEntryFresh({ v: 1, path: "p", savedAt: "bozuk", data: 1 }, "schedule", now)).toBe(false);
  });
});

describe("depo — yazma/okuma/bozuk-temizlik", () => {
  it("yaz → oku döngüsü", async () => {
    const backend = createMemoryBackend();
    await writeCacheEntry(backend, INPUT, { lessons: [1] });
    const { entry, fresh } = await readCacheEntry<{ lessons: number[] }>(backend, INPUT);
    expect(entry?.data).toEqual({ lessons: [1] });
    expect(fresh).toBe(true);
  });

  it("allowlist dışı yazılmaz", async () => {
    const backend = createMemoryBackend();
    await writeCacheEntry(backend, { ...INPUT, path: "/api/v1/mobile/session" }, { x: 1 });
    expect(backend.keys()).toEqual([]);
  });

  it("bozuk kayıt silinir, miss sayılır", async () => {
    const backend = createMemoryBackend();
    await writeCacheEntry(backend, INPUT, { a: 1 });
    const key = backend.keys()[0]!;
    await backend.writeText(key, "{bozuk json");
    const { entry } = await readCacheEntry(backend, INPUT);
    expect(entry).toBeNull();
    expect(backend.keys()).toEqual([]);
  });

  it("sürüm uyuşmazlığı miss sayılır", async () => {
    const backend = createMemoryBackend();
    await writeCacheEntry(backend, INPUT, { a: 1 });
    const key = backend.keys()[0]!;
    await backend.writeText(key, JSON.stringify({ v: 999, path: INPUT.path, savedAt: new Date().toISOString(), data: {} }));
    const { entry } = await readCacheEntry(backend, INPUT);
    expect(entry).toBeNull();
  });

  it("kullanıcı önekiyle toplu silme (logout)", async () => {
    const backend = createMemoryBackend();
    await writeCacheEntry(backend, INPUT, { a: 1 });
    await writeCacheEntry(backend, { ...INPUT, path: "/api/v1/students/s1/homework" }, { b: 2 });
    await writeCacheEntry(backend, { ...INPUT, userId: "u2" }, { c: 3 });
    await backend.removePrefix(cacheUserPrefix("t1", "u1"));
    expect(backend.keys().length).toBe(1);
  });

  it("tek kayıt silme (401/403 erişim kaybı)", async () => {
    const backend = createMemoryBackend();
    await writeCacheEntry(backend, INPUT, { a: 1 });
    await removeCacheEntry(backend, INPUT);
    const { entry } = await readCacheEntry(backend, INPUT);
    expect(entry).toBeNull();
  });
});
