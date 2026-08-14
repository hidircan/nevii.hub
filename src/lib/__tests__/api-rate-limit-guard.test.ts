import { describe, it, expect, beforeEach } from "vitest";
import { enforceUserRateLimit } from "../api/rate-limit-guard";
import { __resetRateLimitForTests } from "../rate-limit";

beforeEach(() => {
  __resetRateLimitForTests("test-bucket");
});

describe("enforceUserRateLimit (AI/upload/mesaj gönderim endpoint limitleri)", () => {
  it("limit altında null döner (istek geçer)", () => {
    for (let i = 0; i < 5; i++) {
      expect(enforceUserRateLimit("test-bucket", "user1", { windowMs: 60_000, max: 5 })).toBeNull();
    }
  });

  it("limit aşılınca 429 + Retry-After döner", async () => {
    for (let i = 0; i < 5; i++) {
      enforceUserRateLimit("test-bucket", "user1", { windowMs: 60_000, max: 5 });
    }
    const res = enforceUserRateLimit("test-bucket", "user1", { windowMs: 60_000, max: 5 });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get("Retry-After")).toBeTruthy();
    const json = (await res!.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("RATE_LIMITED");
  });

  it("farklı kullanıcılar birbirini etkilemez", () => {
    for (let i = 0; i < 5; i++) {
      enforceUserRateLimit("test-bucket", "userA", { windowMs: 60_000, max: 5 });
    }
    expect(enforceUserRateLimit("test-bucket", "userB", { windowMs: 60_000, max: 5 })).toBeNull();
  });
});
