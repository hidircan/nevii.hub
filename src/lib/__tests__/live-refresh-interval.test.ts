import { describe, it, expect } from "vitest";
import { liveRefreshIntervalMs, NON_PRODUCTION_LIVE_REFRESH_MS, PRODUCTION_LIVE_REFRESH_MS } from "../env/live-refresh";

describe("portal canlı yenileme aralığı (DB egress)", () => {
  it("production'da ürün davranışı aynen 45 sn", () => {
    expect(liveRefreshIntervalMs({ NEVII_DEPLOYMENT_TIER: "production" })).toBe(PRODUCTION_LIVE_REFRESH_MS);
    expect(liveRefreshIntervalMs({ VERCEL_ENV: "production" })).toBe(45_000);
  });
  it("test/önizleme/yerel ortamda 5 dk; test katmanı Vercel production'da bile production sayılmaz", () => {
    for (const env of [{ NEVII_DEPLOYMENT_TIER: "test" }, { NEVII_DEPLOYMENT_TIER: "review" }, { VERCEL_ENV: "preview" }, {}, { NEVII_DEPLOYMENT_TIER: "test", VERCEL_ENV: "production" }]) {
      expect(liveRefreshIntervalMs(env)).toBe(NON_PRODUCTION_LIVE_REFRESH_MS);
    }
  });
  it("NEVII_LIVE_REFRESH_MS ile ezilir (0 = yalnız sekmeye dönünce); geçersiz değer yok sayılır", () => {
    expect(liveRefreshIntervalMs({ NEVII_LIVE_REFRESH_MS: "0", NEVII_DEPLOYMENT_TIER: "production" })).toBe(0);
    expect(liveRefreshIntervalMs({ NEVII_LIVE_REFRESH_MS: "45000", NEVII_DEPLOYMENT_TIER: "test" })).toBe(45_000);
    expect(liveRefreshIntervalMs({ NEVII_LIVE_REFRESH_MS: "abc", NEVII_DEPLOYMENT_TIER: "production" })).toBe(45_000);
  });
});
