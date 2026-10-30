import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { __resetRateLimitForTests } from "../rate-limit";
import { DEV_HYPER_ADMIN_EMAIL, DEV_HYPER_ADMIN_PASSWORD } from "../auth/config";
import { LOGIN_THROTTLE_MAX_FAILURES, LOGIN_THROTTLE_WINDOW_MS, readLoginThrottle, recordLoginFailure, resetLoginThrottleForTests } from "../auth/login-throttle";
import { turnstileSiteKeyForWidget, turnstileStatus, verifyTurnstileToken } from "../auth/turnstile";
import { POST as webLogin } from "../../app/api/v1/auth/login/route";
import { POST as nativeLogin } from "../../app/api/v1/auth/mobile/login/route";

const ROOT = process.cwd();
const REAL_SITE = "0x4AAAAAAA-site";
const REAL_SECRET = "0x4AAAAAAA-secret";

function post(route: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request(`https://app.example.test${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", origin: "https://app.example.test", ...headers },
    body: JSON.stringify(body),
  });
}

const creds = { email: DEV_HYPER_ADMIN_EMAIL, password: DEV_HYPER_ADMIN_PASSWORD };

function siteverify(result: Record<string, unknown>, status = 200) {
  const mock = vi.fn(async () => new Response(JSON.stringify(result), { status }));
  vi.stubGlobal("fetch", mock);
  return mock;
}
const passed = { success: true, hostname: "app.example.test", action: "login" };

beforeEach(() => {
  for (const b of ["auth-login-ip", "auth-login-ip-email", "auth-login-native-ip"]) __resetRateLimitForTests(b);
  resetLoginThrottleForTests();
  vi.stubEnv("TURNSTILE_ENABLED", "true");
  vi.stubEnv("TURNSTILE_SITE_KEY", REAL_SITE);
  vi.stubEnv("TURNSTILE_SECRET_KEY", REAL_SECRET);
  vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Turnstile yapılandırması", () => {
  it("bayrak kapalıysa koruma yok, widget çizilmez", () => {
    vi.stubEnv("TURNSTILE_ENABLED", "");
    expect(turnstileStatus()).toBe("off");
    expect(turnstileSiteKeyForWidget()).toBeNull();
  });

  it("anahtar eksikse 'etkin' sayılmaz ve giriş kilitlenmez", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(turnstileStatus()).toBe("misconfigured");
    expect(turnstileSiteKeyForWidget()).toBeNull();
    const mock = siteverify(passed);
    expect((await webLogin(post("/api/v1/auth/login", creds))).status).toBe(200);
    expect(mock).not.toHaveBeenCalled();
  });

  it("canlıda test anahtarı etkin sayılmaz; yerelde sayılır", () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
    expect(turnstileStatus()).toBe("active");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(turnstileStatus()).toBe("misconfigured");
  });

  it("secret istemci koduna ve NEXT_PUBLIC değişkenine girmez", () => {
    for (const file of ["src/components/turnstile-field.tsx", "src/components/login-form.tsx"]) {
      expect(readFileSync(path.join(ROOT, file), "utf-8")).not.toMatch(/SECRET|lib\/auth\/turnstile/);
    }
    expect(readFileSync(path.join(ROOT, "src/lib/auth/turnstile.ts"), "utf-8")).not.toMatch(/NEXT_PUBLIC/);
  });
});

describe("gözlem modu (TURNSTILE_ENABLED=observe)", () => {
  beforeEach(() => vi.stubEnv("TURNSTILE_ENABLED", "observe"));

  it("widget çizilir ama koruma sayılmaz", () => {
    expect(turnstileStatus()).toBe("observe");
    expect(turnstileSiteKeyForWidget()).toBe(REAL_SITE);
  });

  it("token'sız istek ve geçersiz token girişi engellemez (eski mobil sürüm çalışır)", async () => {
    siteverify({ success: false, "error-codes": ["invalid-input-response"] });
    expect((await webLogin(post("/api/v1/auth/login", creds))).status).toBe(200);
    __resetRateLimitForTests("auth-login-ip-email");
    expect((await webLogin(post("/api/v1/auth/login", { ...creds, takeover: true, turnstileToken: "kotu" }))).status).toBe(200);
  });

  it("Cloudflare'e ulaşılamasa da giriş sürer; token yoksa Cloudflare'e gidilmez", async () => {
    const down = vi.fn(async () => {
      throw new Error("network");
    });
    vi.stubGlobal("fetch", down);
    expect((await webLogin(post("/api/v1/auth/login", creds))).status).toBe(200);
    expect(down).not.toHaveBeenCalled();
    expect((await webLogin(post("/api/v1/auth/login", { ...creds, takeover: true, turnstileToken: "tok" }))).status).toBe(200);
    expect(down).toHaveBeenCalledTimes(2);
  });

  it("canlıda test anahtarıyla gözlem de etkin sayılmaz", () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(turnstileStatus()).toBe("misconfigured");
  });
});

describe("web girişi — token doğrulaması", () => {
  it("geçerli token + doğru parola girer; secret ve token siteverify'a sunucudan gider", async () => {
    const mock = siteverify(passed);
    const res = await webLogin(post("/api/v1/auth/login", { ...creds, turnstileToken: "tok" }));
    expect(res.status).toBe(200);
    const sent = (mock.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(sent.get("secret")).toBe(REAL_SECRET);
    expect(sent.get("response")).toBe("tok");
    expect(sent.get("idempotency_key")).toBeTruthy();
    expect(JSON.stringify(await res.json())).not.toContain(REAL_SECRET);
  });

  it("direkt API: token yoksa doğru parolayla da girilemez, Cloudflare'e bile gidilmez", async () => {
    const mock = siteverify(passed);
    const res = await webLogin(post("/api/v1/auth/login", creds));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("TURNSTILE_REQUIRED");
    expect(mock).not.toHaveBeenCalled();
  });

  it("'ben mobilim' başlıkları ve Origin'siz istek web korumasını atlatamaz", async () => {
    siteverify(passed);
    const req = new Request("https://app.example.test/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", "x-client": "mobile", "x-nevii-mobile": "1", "user-agent": "NeviiHub/1.0.1 CFNetwork" },
      body: JSON.stringify(creds),
    });
    expect((await webLogin(req)).status).toBe(400);
  });

  it.each([
    [{ success: false, "error-codes": ["invalid-input-response"] }, "TURNSTILE_INVALID", 400],
    [{ success: false, "error-codes": ["timeout-or-duplicate"] }, "TURNSTILE_EXPIRED", 400],
    [{ success: false, "error-codes": ["invalid-input-secret"] }, "TURNSTILE_UNAVAILABLE", 503],
    [{ success: true, hostname: "evil.example", action: "login" }, "TURNSTILE_INVALID", 400],
    [{ success: true, hostname: "app.example.test", action: "signup" }, "TURNSTILE_INVALID", 400],
  ])("%j reddedilir", async (result, code, status) => {
    siteverify(result);
    const res = await webLogin(post("/api/v1/auth/login", { ...creds, turnstileToken: "tok" }));
    expect(res.status).toBe(status);
    expect(((await res.json()) as { error: { code: string; message: string } }).error.code).toBe(code);
  });

  it("Cloudflare'e ulaşılamazsa sessizce atlanmaz; bir kez yeniden dener, Türkçe hata verir", async () => {
    const mock = vi.fn(async () => {
      throw new Error("network");
    });
    vi.stubGlobal("fetch", mock);
    const res = await webLogin(post("/api/v1/auth/login", { ...creds, turnstileToken: "tok" }));
    expect(res.status).toBe(503);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/tekrar deneyin/);
    const keys = (mock.mock.calls as unknown as [string, { body: URLSearchParams }][]).map((c) => c[1].body.get("idempotency_key"));
    expect(keys[0]).toBe(keys[1]);
  });

  it("başarısız doğrulamada parola kontrol edilmez: yanıt parola doğruluğunu sızdırmaz", async () => {
    siteverify({ success: false, "error-codes": ["invalid-input-response"] });
    const right = await webLogin(post("/api/v1/auth/login", { ...creds, turnstileToken: "tok" }));
    const wrong = await webLogin(post("/api/v1/auth/login", { email: creds.email, password: "yanlis", turnstileToken: "tok" }));
    expect(right.status).toBe(wrong.status);
    expect(await right.text()).toBe(await wrong.text());
  });

  it("rate limit Cloudflare'den önce çalışır, parola hatası korunur", async () => {
    siteverify(passed);
    const bad = await webLogin(post("/api/v1/auth/login", { email: creds.email, password: "yanlis", turnstileToken: "tok" }));
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
    const mock = siteverify(passed);
    for (let i = 0; i < 4; i++) await webLogin(post("/api/v1/auth/login", { email: creds.email, password: "yanlis", turnstileToken: "tok" }));
    mock.mockClear();
    const limited = await webLogin(post("/api/v1/auth/login", { email: creds.email, password: "yanlis", turnstileToken: "tok" }));
    expect(limited.status).toBe(429);
    expect(mock).not.toHaveBeenCalled();
  });

  it("yerel test anahtarında sabit hostname/action reddedilmez", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
    siteverify({ success: true, hostname: "localhost", action: "test" });
    expect((await verifyTurnstileToken("XXXX.DUMMY.TOKEN.XXXX", { requestHost: "localhost" })).ok).toBe(true);
  });
});

describe("mobil giriş ucu", () => {
  it("gerçek öğretmen token'sız girer; JWT gövdede, çerez yok, Cloudflare'e gidilmez", async () => {
    const mock = siteverify(passed);
    const req = new Request("https://app.example.test/api/v1/auth/mobile/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify({ email: "turgay.hosbas@niluferacar.com.tr", password: "demo-teacher-csv-1", clientSupportsTakeover: true }),
    });
    const res = await nativeLogin(req);
    const body = (await res.json()) as { ok: boolean; data?: { accessToken: string; refreshToken: string; user: { role: string } } };
    expect(res.status).toBe(200);
    expect(body.data?.user.role).toBe("TEACHER");
    expect(body.data?.accessToken).toBeTruthy();
    expect(body.data?.refreshToken).toBeTruthy();
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(mock).not.toHaveBeenCalled();
  });

  it("aynı öğretmen web ucundan token'sız giremez", async () => {
    const res = await webLogin(post("/api/v1/auth/login", { email: "turgay.hosbas@niluferacar.com.tr", password: "demo-teacher-csv-1" }));
    expect(res.status).toBe(400);
  });

  it("platform sahibi hesabı bu uçtan açılamaz; yanıt hatalı parolayla aynıdır", async () => {
    const right = await nativeLogin(post("/api/v1/auth/mobile/login", creds));
    const wrong = await nativeLogin(post("/api/v1/auth/mobile/login", { email: creds.email, password: "yanlis" }));
    expect(right.status).toBe(wrong.status);
    expect(await right.text()).toBe(await wrong.text());
  });

  it("IP başına sınır web'den sıkıdır", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) last = await nativeLogin(post("/api/v1/auth/mobile/login", { email: `u${i}@example.test`, password: "x" }));
    expect(last?.status).toBe(429);
  });

  it("mobil uygulama yeni ucu kullanır", () => {
    expect(readFileSync(path.join(ROOT, "apps/mobile/src/auth/auth-context.tsx"), "utf-8")).toContain("/api/v1/auth/mobile/login");
  });
});

describe("hesap bazlı giriş sınırı", () => {
  const teacher = { email: "turgay.hosbas@niluferacar.com.tr", password: "demo-teacher-csv-1" };
  const fromIp = (ip: string, password: string) =>
    new Request("https://app.example.test/api/v1/auth/mobile/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email: teacher.email, password }),
    });

  it("farklı IP'lerden gelen deneme de hesabı durdurur; doğru parola bile o sürede girmez", async () => {
    for (let i = 0; i < LOGIN_THROTTLE_MAX_FAILURES; i++) await nativeLogin(fromIp(`198.51.100.${i + 1}`, "yanlis"));
    const res = await nativeLogin(fromIp("198.51.100.200", teacher.password));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(((await res.json()) as { error: { message: string } }).error.message).not.toMatch(/kayıtlı|bulunamadı/i);
  });

  it("web ve mobil aynı sayacı paylaşır", async () => {
    for (let i = 0; i < LOGIN_THROTTLE_MAX_FAILURES; i++) await recordLoginFailure(teacher.email);
    vi.stubEnv("TURNSTILE_ENABLED", "");
    expect((await webLogin(post("/api/v1/auth/login", teacher))).status).toBe(429);
  });

  it("eşik altında başarılı giriş sayacı sıfırlar; süre dolunca kilit kendiliğinden açılır", async () => {
    for (let i = 0; i < LOGIN_THROTTLE_MAX_FAILURES - 1; i++) await recordLoginFailure(teacher.email);
    expect((await nativeLogin(fromIp("198.51.100.1", teacher.password))).status).toBe(200);
    expect((await readLoginThrottle(teacher.email)).hasCounter).toBe(false);

    const t0 = Date.now();
    for (let i = 0; i < LOGIN_THROTTLE_MAX_FAILURES; i++) await recordLoginFailure(teacher.email, t0);
    expect((await readLoginThrottle(teacher.email, t0)).blocked).toBe(true);
    expect((await readLoginThrottle(teacher.email, t0 + LOGIN_THROTTLE_WINDOW_MS + 1)).blocked).toBe(false);
  });

  it("sayaç hesap adını yazmaz; ayar listelerine karışmaz", () => {
    const src = readFileSync(path.join(ROOT, "src/lib/platform/store.ts"), "utf-8");
    expect(src).toContain('THROTTLE_SCOPE_PREFIX = "auth_throttle:"');
    expect(readFileSync(path.join(ROOT, "src/lib/auth/login-throttle.ts"), "utf-8")).toContain('createHash("sha256")');
  });
});

describe("AI asistan yetkisi sunucuda", () => {
  it("öğretmen ve öğrenci sohbet uçlarını kullanamaz, yöneticiler kullanır", async () => {
    const { hasPermission } = await import("../auth/rbac");
    for (const role of ["TEACHER", "STUDENT", "BRANCH_MANAGER", "AI_AGENT"] as const) expect(hasPermission(role, "ai:chat"), role).toBe(false);
    for (const role of ["HYPER_ADMIN", "SUPER_ADMIN", "SCHOOL_ADMIN"] as const) expect(hasPermission(role, "ai:chat"), role).toBe(true);
    for (const file of ["src/app/api/v1/chat/route.ts", "src/app/api/v1/chat/stream/route.ts", "src/app/api/v1/chat/[conversationId]/route.ts"]) {
      const src = readFileSync(path.join(ROOT, file), "utf-8");
      expect(src, file).toContain('"ai:chat"');
      expect(src, file).not.toContain('"tools:catalog"');
    }
  });
});

describe("CSP", () => {
  it("yalnız Cloudflare challenge alan adı eklenir; PayTR form-action korunur", () => {
    const config = readFileSync(path.join(ROOT, "next.config.ts"), "utf-8");
    // 'self' şart: e-posta önizleme iframe'leri frame-src olmadan default-src'e düşüyordu.
    expect(config).toContain(`"frame-src 'self' https://challenges.cloudflare.com"`);
    expect(config).toContain("form-action 'self' https://www.paytr.com");
    expect(config).not.toMatch(/connect-src[^"]*cloudflare/);
  });
});
