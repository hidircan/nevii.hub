/**
 * 2026-10-14 — NeviiOS platform sahibi (HYPER_ADMIN) giriş/şifre sıfırlama. Canlı olay: hesap satırı DB'de yoktu;
 * giriş `no_such_user`, "şifremi unuttum" sessizce hiçbir şey yapmıyor ve HİÇ iz bırakmıyordu (tenant'sız denetim
 * olayı düşüyordu). Burada var olan platform hesabının akışı uçtan uca ve teşhis logunun sır sızdırmadığı doğrulanır.
 * json modunda geliştirme platform hesabı (`hyper@nevii-hub.test`) kullanılır; gerçek e-posta GÖNDERİLMEZ.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { POST as forgotPassword } from "../../app/api/v1/auth/forgot-password/route";
import { POST as resetPassword } from "../../app/api/v1/auth/reset-password/route";
import { setEmailTransportForTests } from "../email";
import type { EmailSendInput } from "../email/types";
import { authenticateUser, tenantAllowsLogin } from "../auth/users";
import { createPasswordResetToken } from "../auth/password-reset";
import { DEFAULT_TENANT_ID, DEV_HYPER_ADMIN_EMAIL, PLATFORM_TENANT_ID } from "../auth/config";
import { homePathForRole } from "../auth/role-routes";

const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let sent: EmailSendInput[] = [];
afterEach(() => {
  setEmailTransportForTests(null);
  sent = [];
  vi.restoreAllMocks();
});
function mockMail() {
  setEmailTransportForTests({ name: "mock", async send(input) { sent.push(input); return { delivered: true, messageId: "m" }; } });
}
function linkToken(mail: EmailSendInput): string {
  const m = (mail.text ?? mail.html).match(/\/sifre-sifirla\?token=([^"'\s&<]+)/);
  if (!m?.[1]) throw new Error("sıfırlama bağlantısı yok");
  return decodeURIComponent(m[1]);
}

describe("platform sahibi: şifremi unuttum → sıfırla → /platform", () => {
  it("bağlantı platform sıfırlama akışına döner; şifre değişir; HYPER_ADMIN /platform'a yönlenir; token tek kullanımlık", async () => {
    mockMail();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await forgotPassword(post("/api/v1/auth/forgot-password", { email: DEV_HYPER_ADMIN_EMAIL }));
    expect((await res.json()).data.message).toContain("kayıtlı bir hesap varsa");
    expect(sent.map((m) => m.to)).toEqual([DEV_HYPER_ADMIN_EMAIL]);
    const token = linkToken(sent[0]!);

    // İç log: güvenli kod + istek kimliği; yerel kısım ve token YOK.
    const logged = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain('"reason":"requested"');
    expect(logged).toContain('"requestId"');
    expect(logged).not.toContain(DEV_HYPER_ADMIN_EMAIL);
    expect(logged).not.toContain(token);

    const newPassword = "platform-yeni-sifre-2026";
    const done = await resetPassword(post("/api/v1/auth/reset-password", { token, newPassword }));
    const json = (await done.json()) as { ok: boolean; data?: { role?: string; destination?: { webPath: string } } };
    expect(json.ok).toBe(true);
    expect(json.data?.role).toBe("HYPER_ADMIN");
    expect(json.data?.destination?.webPath).toBe("/platform");
    expect((await authenticateUser(DEV_HYPER_ADMIN_EMAIL, newPassword))?.role).toBe("HYPER_ADMIN");

    const reused = await resetPassword(post("/api/v1/auth/reset-password", { token, newPassword: "baska-bir-sifre-99" }));
    expect((await reused.json()).ok).toBe(false);
  });

  it("süresi dolmuş ve geçersiz token reddedilir (aynı jenerik mesaj)", async () => {
    const user = await authenticateUser(DEV_HYPER_ADMIN_EMAIL, "yanlis").catch(() => null);
    expect(user).toBeNull();
    const expired = await createPasswordResetToken(PLATFORM_TENANT_ID, "user_hyper_admin", -1000);
    const a = await (await resetPassword(post("/api/v1/auth/reset-password", { token: expired, newPassword: "x-12345678" }))).json();
    const b = await (await resetPassword(post("/api/v1/auth/reset-password", { token: "GECERSIZ1", newPassword: "x-12345678" }))).json();
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    expect(a.error.message).toBe(b.error.message);
  });
});

describe("hesap yokken: dışarıya nötr, içeride teşhis edilebilir", () => {
  it("bilinmeyen adres → nötr yanıt, e-posta denenmez, log 'no_eligible_account' (adres maskeli)", async () => {
    mockMail();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const email = "info-yok-19@ornek.test";
    const res = await forgotPassword(post("/api/v1/auth/forgot-password", { email }));
    expect((await res.json()).data.message).toContain("kayıtlı bir hesap varsa");
    expect(sent).toHaveLength(0);
    const logged = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain('"reason":"no_eligible_account"');
    expect(logged).toContain("***@ornek.test");
    expect(logged).not.toContain("info-yok-19");
  });

  it("hesabı olmayan adresle giriş reddi tenant'sız da loglanır (maskeli)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await authenticateUser("info-yok-20@ornek.test", "herhangi-bir-sifre")).toBeNull();
    const logged = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("auth.login_failure");
    expect(logged).toContain("no_such_user");
    expect(logged).not.toContain("info-yok-20");
  });
});

describe("yetki yükseltme yok", () => {
  it("kurum hesabı platform tenant'ında oturum açamaz; HYPER_ADMIN yalnız platform tenant'ında", async () => {
    expect(await tenantAllowsLogin(PLATFORM_TENANT_ID, "SUPER_ADMIN")).toBe(false);
    expect(await tenantAllowsLogin(PLATFORM_TENANT_ID, "SCHOOL_ADMIN")).toBe(false);
    expect(await tenantAllowsLogin(DEFAULT_TENANT_ID, "HYPER_ADMIN")).toBe(false);
    expect(homePathForRole("SUPER_ADMIN")).not.toMatch(/^\/platform/);
  });
});
