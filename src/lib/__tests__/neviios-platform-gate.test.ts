import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { resolveSafeLoginNext, resolvePlatformLoginDest } from "../auth/role-routes";
import { DEV_HYPER_ADMIN_EMAIL } from "../auth/config";
import { __resetRateLimitForTests } from "../rate-limit";
import { POST as loginPost } from "../../app/api/v1/auth/login/route";

/**
 * NeviiOS Control Center (2026-09-28) — ayrı platform kapısı hedefli
 * regresyon: oturumsuz yönlendirme, rol sınırları, next güvenliği, hesap
 * varlığı sızıntısı yok. info@neviihub.com girişi ve SMTP reset akışına
 * DOKUNULMAZ (aynı route/form yeniden kullanılır).
 */

const ROOT = process.cwd();

function loginReq(email: string, password: string) {
  return new Request("https://example.test/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.99" },
    body: JSON.stringify({ email, password }),
  });
}

describe("resolveSafeLoginNext — open redirect kapalı", () => {
  const F = "/panel";
  it("uygulama-içi yolu aynen geçirir", () => {
    expect(resolveSafeLoginNext("/platform/kurumlar/x", F)).toBe("/platform/kurumlar/x");
    expect(resolveSafeLoginNext("/panel/ogrenciler?id=1", F)).toBe("/panel/ogrenciler?id=1");
  });
  it("mutlak URL, protokol-göreli, şema, ters bölü reddedilir", () => {
    expect(resolveSafeLoginNext("https://evil.test/phish", F)).toBe(F);
    expect(resolveSafeLoginNext("//evil.test/x", F)).toBe(F);
    expect(resolveSafeLoginNext("/x:@evil.test", F)).toBe(F);
    expect(resolveSafeLoginNext("/\\evil.test", F)).toBe(F);
    expect(resolveSafeLoginNext("/platform\nSet-Cookie:x", F)).toBe(F);
  });
  it("çift kodlanmış // saldırısı çözülüp reddedilir", () => {
    expect(resolveSafeLoginNext("%2F%2Fevil.test%2Fx", F)).toBe(F);
  });
  it("boş/bozuk/aşırı uzun değer fallback'e düşer", () => {
    expect(resolveSafeLoginNext(null, F)).toBe(F);
    expect(resolveSafeLoginNext("", F)).toBe(F);
    expect(resolveSafeLoginNext("%E0%A4%A", F)).toBe(F);
    expect(resolveSafeLoginNext(`/${"a".repeat(600)}`, F)).toBe(F);
  });
});

describe("resolvePlatformLoginDest — rol sınırları", () => {
  it("HYPER_ADMIN yalnız /platform altında kalır", () => {
    expect(resolvePlatformLoginDest("HYPER_ADMIN", "/platform/kurumlar/x")).toBe("/platform/kurumlar/x");
    expect(resolvePlatformLoginDest("HYPER_ADMIN", "/platform")).toBe("/platform");
    expect(resolvePlatformLoginDest("HYPER_ADMIN", null)).toBe("/platform");
    expect(resolvePlatformLoginDest("HYPER_ADMIN", "/panel")).toBe("/platform");
    expect(resolvePlatformLoginDest("HYPER_ADMIN", "https://evil.test")).toBe("/platform");
    expect(resolvePlatformLoginDest("HYPER_ADMIN", "/platformx")).toBe("/platform");
  });
  it("kurum yöneticisi platforma SOKULMAZ — kendi evine gider", () => {
    expect(resolvePlatformLoginDest("SUPER_ADMIN", "/platform/kurumlar/x")).toBe("/panel");
    expect(resolvePlatformLoginDest("SCHOOL_ADMIN", "/platform")).toBe("/panel");
    expect(resolvePlatformLoginDest("BRANCH_MANAGER", "/platform")).toBe("/sube");
    expect(resolvePlatformLoginDest("TEACHER", "/platform")).toBe("/ogretmen");
    expect(resolvePlatformLoginDest("STUDENT", "/platform")).toBe("/ogrenci");
  });
});

describe("kapı yönlendirmesi — kaynakta doğrulanır", () => {
  it("middleware: platform → /platform/giris, kurum → /login, kapı muaf", () => {
    const mw = readFileSync(path.join(ROOT, "src/middleware.ts"), "utf8");
    expect(mw).toMatch(/pathname === "\/platform\/giris"\) return NextResponse\.next\(\)/);
    expect(mw).toMatch(/isPlatform \? "\/platform\/giris" : "\/login"/);
  });
  it("requirePlatformSession oturumsuzu ayrı kapıya yollar", () => {
    const session = readFileSync(path.join(ROOT, "src/lib/platform/session.ts"), "utf8");
    expect(session).toContain("redirect(`/platform/giris?next=");
    expect(session).not.toContain("redirect(`/login?next=");
  });
  it("/login kurum kapısı olarak kalır (platforma yönlendirmez)", () => {
    const login = readFileSync(path.join(ROOT, "src/app/login/page.tsx"), "utf8");
    expect(login).not.toContain("/platform/giris");
    expect(login).toContain("resolveSafeLoginNext");
  });
  it("platform kapısı ayrı ad + görünüm taşır, auth akışını yeniden kullanır", () => {
    const giris = readFileSync(path.join(ROOT, "src/app/platform/(gate)/giris/page.tsx"), "utf8");
    expect(giris).toContain("NeviiOS Control Center");
    expect(giris).toContain("platformGate");
    expect(giris).not.toMatch(/fetch\(\s*["'`]\/api\//);
  });
});

describe("hesap varlığı sızıntısı yok (nötr yanıt korunur)", () => {
  beforeEach(() => {
    __resetRateLimitForTests("auth-login-ip");
    __resetRateLimitForTests("auth-login-ip-email");
  });
  it("bilinmeyen e-posta ile yanlış şifre AYNI 401 mesajını döner", async () => {
    const unknown = await loginPost(loginReq("yok-boyle-hesap-12345@example.test", "yanlis-sifre-1"));
    const wrong = await loginPost(loginReq(DEV_HYPER_ADMIN_EMAIL, "kesinlikle-yanlis-sifre-2"));
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    const u = (await unknown.json()) as { error?: { code?: string; message?: string } };
    const w = (await wrong.json()) as { error?: { code?: string; message?: string } };
    expect(u.error?.code).toBe("UNAUTHORIZED");
    expect(w.error?.code).toBe("UNAUTHORIZED");
    expect(u.error?.message).toBe(w.error?.message);
  });
});
