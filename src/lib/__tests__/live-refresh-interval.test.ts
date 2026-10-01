import { describe, it, expect } from "vitest";
import { liveRefreshIntervalMs, LIVE_REFRESH_MS } from "../env/live-refresh";

describe("portal canlı yenileme aralığı (Vercel Active CPU + DB egress)", () => {
  it("her ortamda 5 dk — production dahil", () => {
    expect(LIVE_REFRESH_MS).toBe(300_000);
    for (const env of [{ NEVII_DEPLOYMENT_TIER: "production" }, { VERCEL_ENV: "production" }, { NEVII_DEPLOYMENT_TIER: "test" }, { VERCEL_ENV: "preview" }, {}]) {
      expect(liveRefreshIntervalMs(env)).toBe(LIVE_REFRESH_MS);
    }
  });
  it("NEVII_LIVE_REFRESH_MS ile ezilir (0 = yalnız sekmeye dönünce); geçersiz değer yok sayılır", () => {
    expect(liveRefreshIntervalMs({ NEVII_LIVE_REFRESH_MS: "0", NEVII_DEPLOYMENT_TIER: "production" })).toBe(0);
    expect(liveRefreshIntervalMs({ NEVII_LIVE_REFRESH_MS: "45000" })).toBe(45_000);
    expect(liveRefreshIntervalMs({ NEVII_LIVE_REFRESH_MS: "abc", NEVII_DEPLOYMENT_TIER: "production" })).toBe(LIVE_REFRESH_MS);
  });
});
