import { describe, it, expect, beforeEach } from "vitest";
import { __resetRateLimitForTests } from "../rate-limit";
import { POST as loginPost } from "../../app/api/v1/auth/login/route";

function req(email: string, password: string, ip = "203.0.113.5") {
  return new Request("https://example.test/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email, password }),
  });
}

beforeEach(() => {
  __resetRateLimitForTests("auth-login-ip");
  __resetRateLimitForTests("auth-login-ip-email");
});

describe("login rate limit (K3)", () => {
  it("aynı IP+email için 5 başarısız denemeden sonra 429 döner", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await loginPost(req("nouser@example.test", "wrong-pass"));
    }
    expect(last?.status).toBe(429);
    const json = (await last!.json()) as { error?: { code?: string; message?: string } };
    expect(json.error?.code).toBe("RATE_LIMITED");
    // Response must not reveal whether the account exists.
    expect(json.error?.message).not.toMatch(/exist|kayıtlı|bulunamadı/i);
  });

  it("farklı email aynı IP'den ayrı sayaçla sınırlanır ama IP-genel limit de var", async () => {
    // 4 attempts on email A (under the 5-per-email limit) should not trip the per-email bucket.
    for (let i = 0; i < 4; i++) {
      const res = await loginPost(req("a@example.test", "wrong"));
      expect(res.status).not.toBe(429);
    }
    // A different email from the same IP still hits its own per-email bucket independently.
    const res = await loginPost(req("b@example.test", "wrong"));
    expect(res.status).not.toBe(429);
  });

  it("farklı IP'den aynı email denemeleri birbirini etkilemez", async () => {
    for (let i = 0; i < 5; i++) {
      await loginPost(req("shared@example.test", "wrong", "198.51.100.1"));
    }
    const fromOtherIp = await loginPost(req("shared@example.test", "wrong", "198.51.100.2"));
    expect(fromOtherIp.status).not.toBe(429);
  });

  it("429 response Retry-After header taşır", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await loginPost(req("nouser2@example.test", "wrong-pass", "203.0.113.6"));
    }
    expect(last?.headers.get("Retry-After")).toBeTruthy();
  });
});
