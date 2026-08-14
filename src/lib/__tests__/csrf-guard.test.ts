import { describe, it, expect } from "vitest";
import { isCrossSiteMutation } from "../api/csrf-guard";
import { signToken } from "../auth/jwt";
import { withApiHandler } from "../api/handler";
import { ok } from "../services/result";
import { ACCESS_COOKIE } from "../auth/cookies";
import type { AuthUser } from "../auth/types";

const APP_URL = "https://app.example.test";

function makeUser(): AuthUser {
  return { userId: "u1", role: "SCHOOL_ADMIN", tenantId: "t1" };
}

describe("isCrossSiteMutation (saf fonksiyon)", () => {
  it("GET isteği hiçbir zaman cross-site sayılmaz (mutating değil)", () => {
    const req = new Request(`${APP_URL}/api/v1/students`, { method: "GET" });
    expect(isCrossSiteMutation(req)).toBe(false);
  });

  it("same-origin Origin header ile POST kabul edilir", () => {
    const req = new Request(`${APP_URL}/api/v1/students`, {
      method: "POST",
      headers: { origin: APP_URL },
    });
    expect(isCrossSiteMutation(req)).toBe(false);
  });

  it("farklı origin'den POST reddedilir", () => {
    const req = new Request(`${APP_URL}/api/v1/students`, {
      method: "POST",
      headers: { origin: "https://evil.test" },
    });
    expect(isCrossSiteMutation(req)).toBe(true);
  });

  it("Origin yok ama same-origin Referer varsa kabul edilir", () => {
    const req = new Request(`${APP_URL}/api/v1/students`, {
      method: "PATCH",
      headers: { referer: `${APP_URL}/panel/ogrenciler/s1` },
    });
    expect(isCrossSiteMutation(req)).toBe(false);
  });

  it("ne Origin ne Referer varsa fail-closed reddedilir", () => {
    const req = new Request(`${APP_URL}/api/v1/students`, { method: "DELETE" });
    expect(isCrossSiteMutation(req)).toBe(true);
  });

  it("ALLOWED_WEB_ORIGINS listesindeki ek origin kabul edilir", () => {
    const prev = process.env.ALLOWED_WEB_ORIGINS;
    process.env.ALLOWED_WEB_ORIGINS = "https://staging.example.test, https://preview.example.test";
    try {
      const req = new Request(`${APP_URL}/api/v1/students`, {
        method: "POST",
        headers: { origin: "https://staging.example.test" },
      });
      expect(isCrossSiteMutation(req)).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.ALLOWED_WEB_ORIGINS;
      else process.env.ALLOWED_WEB_ORIGINS = prev;
    }
  });
});

describe("withApiHandler — cookie-authenticated mutation CSRF koruması (entegrasyon)", () => {
  it("farklı origin'den cookie ile gelen mutation 403 döner", async () => {
    const token = await signToken(makeUser(), "access");
    const handler = withApiHandler(async () => ok({ done: true }));
    const req = new Request(`${APP_URL}/api/v1/whatever`, {
      method: "POST",
      headers: {
        cookie: `${ACCESS_COOKIE}=${token}`,
        origin: "https://evil.test",
      },
    });
    const res = await handler(req);
    expect(res.status).toBe(403);
  });

  it("aynı origin'den cookie ile gelen mutation geçer", async () => {
    const token = await signToken(makeUser(), "access");
    const handler = withApiHandler(async () => ok({ done: true }));
    const req = new Request(`${APP_URL}/api/v1/whatever`, {
      method: "POST",
      headers: {
        cookie: `${ACCESS_COOKIE}=${token}`,
        origin: APP_URL,
      },
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
  });

  it("Bearer token ile gelen mutation Origin header'sız da geçer (mobil/API akışı CSRF'ten muaf)", async () => {
    const token = await signToken(makeUser(), "access");
    const handler = withApiHandler(async () => ok({ done: true }));
    const req = new Request(`${APP_URL}/api/v1/whatever`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
  });

  it("cookie ile gelen GET isteği Origin olmasa da CSRF'ten etkilenmez", async () => {
    const token = await signToken(makeUser(), "access");
    const handler = withApiHandler(async () => ok({ done: true }));
    const req = new Request(`${APP_URL}/api/v1/whatever`, {
      method: "GET",
      headers: { cookie: `${ACCESS_COOKIE}=${token}` },
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
  });
});
