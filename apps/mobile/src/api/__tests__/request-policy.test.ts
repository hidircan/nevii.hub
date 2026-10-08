import { describe, expect, it } from "vitest";
import {
  AUTO_REFRESH_DEDUPE_MS,
  MANUAL_REFRESH_COOLDOWN_MS,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  SEARCH_MIN_CHARS,
  gateSearchQuery,
  isRetryableOutcome,
  retryDelayMs,
  shouldSkipAutoRefresh,
  shouldSkipManualRefresh,
} from "../request-policy";

describe("retry politikası", () => {
  it("ağ hatası ve 5xx retry alır", () => {
    expect(isRetryableOutcome({ kind: "network-error" })).toBe(true);
    expect(isRetryableOutcome({ kind: "http", status: 500 })).toBe(true);
    expect(isRetryableOutcome({ kind: "http", status: 503 })).toBe(true);
    expect(isRetryableOutcome({ kind: "http", status: 599 })).toBe(true);
  });

  it("4xx'te retry YOK (auth/validation/rate-limit fırtınası yok)", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      expect(isRetryableOutcome({ kind: "http", status }), `status ${status}`).toBe(false);
    }
  });

  it("2xx/3xx retry almaz", () => {
    expect(isRetryableOutcome({ kind: "http", status: 200 })).toBe(false);
    expect(isRetryableOutcome({ kind: "http", status: 304 })).toBe(false);
  });

  it("backoff üsteldir, jitter ±%25 bandındadır, tavan aşılmaz", () => {
    expect(retryDelayMs(0, () => 0.5)).toBe(RETRY_BASE_DELAY_MS);
    expect(retryDelayMs(1, () => 0.5)).toBe(RETRY_BASE_DELAY_MS * 2);
    const lo = retryDelayMs(0, () => 0);
    const hi = retryDelayMs(0, () => 1);
    expect(lo).toBe(Math.round(RETRY_BASE_DELAY_MS * 0.75));
    expect(hi).toBe(Math.round(RETRY_BASE_DELAY_MS * 1.25));
    expect(retryDelayMs(99, () => 1)).toBeLessThanOrEqual(RETRY_MAX_DELAY_MS);
    expect(retryDelayMs(-5, () => 0.5)).toBe(RETRY_BASE_DELAY_MS);
  });
});

describe("otomatik yenileme dedupe penceresi", () => {
  it("hiç tamamlanmamışsa atlanmaz", () => {
    expect(shouldSkipAutoRefresh(null, 10_000)).toBe(false);
  });

  it("pencere içinde atlanır, dışında ateşlenir", () => {
    const completedAt = 10_000;
    expect(shouldSkipAutoRefresh(completedAt, completedAt + AUTO_REFRESH_DEDUPE_MS - 1)).toBe(true);
    expect(shouldSkipAutoRefresh(completedAt, completedAt + AUTO_REFRESH_DEDUPE_MS)).toBe(false);
    expect(shouldSkipAutoRefresh(completedAt, completedAt + 60_000)).toBe(false);
  });
});

describe("manuel refresh spam kilidi", () => {
  it("ilk yenileme her zaman geçer", () => {
    expect(shouldSkipManualRefresh(null, 10_000)).toBe(false);
  });

  it("cooldown içinde atlanır, sonra geçer", () => {
    const at = 10_000;
    expect(shouldSkipManualRefresh(at, at + MANUAL_REFRESH_COOLDOWN_MS - 1)).toBe(true);
    expect(shouldSkipManualRefresh(at, at + MANUAL_REFRESH_COOLDOWN_MS)).toBe(false);
  });
});

describe("arama eşikleme", () => {
  it("boş sorgu filtresiz ilk sayfayı getirir", () => {
    expect(gateSearchQuery("")).toEqual({ fetch: true, q: "" });
    expect(gateSearchQuery("   ")).toEqual({ fetch: true, q: "" });
  });

  it("tek karakter istek üretmez (önceki sonuç korunur)", () => {
    expect(gateSearchQuery("a")).toEqual({ fetch: false });
    expect(gateSearchQuery("  a ")).toEqual({ fetch: false });
  });

  it("eşik ve üzeri trim'lenerek gönderilir", () => {
    expect(SEARCH_MIN_CHARS).toBe(2);
    expect(gateSearchQuery("ab")).toEqual({ fetch: true, q: "ab" });
    expect(gateSearchQuery("  abc  ")).toEqual({ fetch: true, q: "abc" });
  });
});
