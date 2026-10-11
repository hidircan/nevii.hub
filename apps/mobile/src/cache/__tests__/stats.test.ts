import { describe, expect, it, beforeEach } from "vitest";
import {
  createMemoryBackend,
  readCacheEntry,
  removeCacheEntry,
  writeCacheEntry,
} from "../cache-store";
import { __resetCacheStats, getCacheStats } from "../stats";
import type { CacheKeyInput } from "../cache-keys";

const INPUT: CacheKeyInput = {
  tenantId: "t1",
  userId: "u1",
  persona: "parent",
  studentId: "s1",
  path: "/api/v1/students/s1/attendance-summary",
};

describe("mobil cache sayaçları", () => {
  beforeEach(() => {
    __resetCacheStats();
  });

  it("miss → write → fresh-hit → stale-hit → purge akışı sayılır", async () => {
    const backend = createMemoryBackend();
    const now = Date.now();

    await readCacheEntry(backend, INPUT, now);
    expect(getCacheStats()).toMatchObject({ reads: 1, misses: 1, hits: 0 });

    await writeCacheEntry(backend, INPUT, { n: 1 }, now);
    expect(getCacheStats().writes).toBe(1);

    const fresh = await readCacheEntry(backend, INPUT, now + 1000);
    expect(fresh.entry).not.toBeNull();
    expect(getCacheStats()).toMatchObject({ hits: 1, freshHits: 1, staleHits: 0 });

    // attendance TTL 30dk — 31dk sonrası stale hit.
    const stale = await readCacheEntry(backend, INPUT, now + 31 * 60_000);
    expect(stale.entry).not.toBeNull();
    expect(stale.fresh).toBe(false);
    expect(getCacheStats()).toMatchObject({ hits: 2, freshHits: 1, staleHits: 1 });

    await removeCacheEntry(backend, INPUT);
    expect(getCacheStats().purges).toBe(1);

    await readCacheEntry(backend, INPUT, now);
    expect(getCacheStats().misses).toBe(2);
  });

  it("sayaçlar PII taşımaz (yalnız sayılar)", () => {
    const stats = getCacheStats();
    for (const v of Object.values(stats)) expect(typeof v).toBe("number");
    expect(JSON.stringify(stats)).not.toContain("s1");
    expect(JSON.stringify(stats)).not.toContain("u1");
  });
});
