import { describe, expect, it, afterEach, vi } from "vitest";
import { SignJWT } from "jose";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("middleware JWT secret resolution (K1)", () => {
  it("getJwtSecret throws fail-closed when JWT_SECRET is unset in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.JWT_SECRET;
    const { getJwtSecret } = await import("@/lib/auth/config");
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/);
    vi.unstubAllEnvs();
  });

  it("middleware never accepts a token signed with the known dev secret in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.JWT_SECRET;

    // A token forged with the known, publicly-visible dev secret string.
    const forgedSecret = new TextEncoder().encode(
      "notaplan-dev-secret-change-me-in-production-32b"
    );
    const forgedToken = await new SignJWT({
      sub: "attacker",
      role: "SUPER_ADMIN",
      tenantId: "tenant_nilufer_acar",
      typ: "access",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("notaplan")
      .setAudience("notaplan-api")
      .setExpirationTime("15m")
      .sign(forgedSecret);

    const { middleware } = await import("@/middleware");
    const { NextRequest } = await import("next/server");
    const { ACCESS_COOKIE } = await import("@/lib/auth/cookies");

    const request = new NextRequest("http://localhost/panel/ogrenciler");
    request.cookies.set(ACCESS_COOKIE, forgedToken);

    const response = await middleware(request);
    // Fail closed: no valid access cookie recognized, no refresh cookie either → redirect to /login.
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    vi.unstubAllEnvs();
  });
});
