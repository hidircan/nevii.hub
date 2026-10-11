import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  __resetServerCache,
  serverCacheGetOrCompute,
  serverCacheStats,
  tenantCacheKey,
} from "../http/server-cache";

beforeEach(() => {
  __resetServerCache();
});

describe("tenantCacheKey", () => {
  it("anahtar tenant ile başlar, segmentleri taşır", () => {
    expect(tenantCacheKey("t1", "dashboard-summary", "v1")).toBe("t:t1:dashboard-summary:v1");
  });

  it("boş tenant fail-closed (çapraz tenant sızıntı yok)", () => {
    expect(() => tenantCacheKey("", "x")).toThrow();
    expect(() => tenantCacheKey("   ", "x")).toThrow();
  });

  it("farklı tenant'lar farklı anahtar üretir", () => {
    expect(tenantCacheKey("a", "s")).not.toBe(tenantCacheKey("b", "s"));
  });
});

describe("serverCacheGetOrCompute", () => {
  it("miss → hesaplar; hit → hesaplamaz (TTL içinde)", async () => {
    const compute = vi.fn(async () => ({ n: 1 }));
    const key = tenantCacheKey("t1", "dashboard-summary", "v1");
    const first = await serverCacheGetOrCompute(key, 60_000, compute, 1_000);
    expect(first).toEqual({ value: { n: 1 }, cached: false });
    const second = await serverCacheGetOrCompute(key, 60_000, compute, 2_000);
    expect(second).toEqual({ value: { n: 1 }, cached: true });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(serverCacheStats()).toMatchObject({ hits: 1, misses: 1 });
  });

  it("TTL dolunca yeniden hesaplar", async () => {
    let n = 0;
    const key = tenantCacheKey("t1", "s", "v1");
    await serverCacheGetOrCompute(key, 1_000, async () => ++n, 0);
    const res = await serverCacheGetOrCompute(key, 1_000, async () => ++n, 1_001);
    expect(res.value).toBe(2);
    expect(res.cached).toBe(false);
  });

  it("eşzamanlı aynı-anahtar hesap tek uçuşta birleşir", async () => {
    let calls = 0;
    const key = tenantCacheKey("t1", "s", "v1");
    const compute = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return calls;
    };
    const results = await Promise.all([
      serverCacheGetOrCompute(key, 60_000, compute),
      serverCacheGetOrCompute(key, 60_000, compute),
      serverCacheGetOrCompute(key, 60_000, compute),
    ]);
    expect(calls).toBe(1);
    expect(results.map((r) => r.value)).toEqual([1, 1, 1]);
  });

  it("compute hatası cache'e yazılmaz, uçuş temizlenir", async () => {
    const key = tenantCacheKey("t1", "s", "v1");
    await expect(serverCacheGetOrCompute(key, 60_000, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    const res = await serverCacheGetOrCompute(key, 60_000, async () => "ok");
    expect(res).toEqual({ value: "ok", cached: false });
    expect(serverCacheStats().size).toBe(1);
  });
});
