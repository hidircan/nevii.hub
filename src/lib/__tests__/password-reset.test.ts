/**
 * Şifremi unuttum + şifre sıfırlama akışı — Paket 2. Kök neden: mobilde
 * "Şifremi unuttum?" girişi vardı ama backend'de karşılığı yoktu.
 *
 * İki katman test edilir:
 *  1. Domain katmanı (`../auth/password-reset`, `../auth/users`) — token
 *     üretimi/tüketimi, tek kullanımlılık, süre aşımı, enumeration koruması.
 *  2. Route katmanı (gerçek HTTP — Bearer JWT gerekmez, public route'lar) —
 *     `mobile-baseline-endpoints.test.ts` ile AYNI desen.
 *
 * NOT: `mehmet@email.com`/`deniz@email.com` ana kod tabanında (MPR'ın aksine)
 * "PARENT" DEĞİL, "STUDENT" rolüne taşınmış demo hesaplardır (bkz.
 * src/lib/auth/types.ts APP_ROLES — PARENT artık bir rol değil).
 */
import { describe, it, expect, afterAll, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { authenticateUser, findUserByEmail, updatePasswordHash } from "../auth/users";
import { createPasswordResetToken, consumePasswordResetToken, isRateLimited } from "../auth/password-reset";
import { hashPassword } from "../auth/password";
import { POST as forgotPassword } from "../../app/api/v1/auth/forgot-password/route";
import { POST as resetPassword } from "../../app/api/v1/auth/reset-password/route";

const PASSWORD_RESET_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "password-reset-tokens.json");

const EMAIL = "mehmet@email.com"; // demo STUDENT (user_parent_s4)
const ORIGINAL_PASSWORD = "demo-parent";
const OTHER_EMAIL = "deniz@email.com"; // demo STUDENT (user_parent_s5) — çapraz kullanıcı izolasyon testi için
const OTHER_PASSWORD = "demo-parent";

function req(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("findUserByEmail — hesap var/yok'u tool seviyesinde açığa çıkarmaz (üst katman bunu tek nötr yanıtla yapar)", () => {
  it("var olan bir kullanıcıyı şifresiz döner", async () => {
    const user = await findUserByEmail(EMAIL);
    expect(user).not.toBeNull();
    expect(user?.role).toBe("STUDENT");
  });

  it("olmayan bir e-posta için null döner", async () => {
    const user = await findUserByEmail("hic-boyle-biri-yok@example.com");
    expect(user).toBeNull();
  });
});

describe("createPasswordResetToken / consumePasswordResetToken — domain katmanı", () => {
  it("üretilen kod bir kez tüketilebilir, aynı kod ikinci kez geçersizdir", async () => {
    const user = await findUserByEmail(EMAIL);
    expect(user).not.toBeNull();
    if (!user) return;

    const raw = await createPasswordResetToken(user.tenantId, user.userId);
    expect(raw).toHaveLength(8); // elle yazılabilir OTP-stili kod

    const first = await consumePasswordResetToken(raw);
    expect(first?.userId).toBe(user.userId);
    expect(first?.tenantId).toBe(user.tenantId);

    const second = await consumePasswordResetToken(raw);
    expect(second).toBeNull();
  });

  it("küçük harf/boşluklu girilen kod da normalize edilerek kabul edilir", async () => {
    const user = await findUserByEmail(EMAIL);
    if (!user) return;
    const raw = await createPasswordResetToken(user.tenantId, user.userId);
    const messy = ` ${raw.slice(0, 4).toLowerCase()} ${raw.slice(4).toLowerCase()} `;
    const result = await consumePasswordResetToken(messy);
    expect(result?.userId).toBe(user.userId);
  });

  it("olmayan/rastgele bir kod geçersizdir", async () => {
    const res = await consumePasswordResetToken("not-a-real-token");
    expect(res).toBeNull();
  });

  it("süresi dolmuş (30 dakikayı geçmiş) bir kod reddedilir — dosya üzerinde geriye tarihleme ile doğrulanır", async () => {
    const user = await findUserByEmail(EMAIL);
    if (!user) return;
    const raw = await createPasswordResetToken(user.tenantId, user.userId);

    const rows = JSON.parse(await fs.readFile(PASSWORD_RESET_FILE, "utf8")) as Array<{
      tokenHash: string;
      expiresAt: string;
      userId: string;
    }>;
    const targetIdx = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.userId === user.userId).pop()!.i;
    rows[targetIdx]!.expiresAt = new Date(Date.now() - 60_000).toISOString(); // 1 dakika önce doldu
    await fs.writeFile(PASSWORD_RESET_FILE, JSON.stringify(rows, null, 2));

    const result = await consumePasswordResetToken(raw);
    expect(result).toBeNull();
  });

  it("aynı kullanıcı için yeni bir kod üretmek ÖNCEKİ kullanılmamış kodu geçersiz kılar", async () => {
    const user = await findUserByEmail(EMAIL);
    if (!user) return;
    const first = await createPasswordResetToken(user.tenantId, user.userId);
    const second = await createPasswordResetToken(user.tenantId, user.userId);

    const firstResult = await consumePasswordResetToken(first);
    expect(firstResult).toBeNull(); // önceki, ikinci kod üretilince geçersiz kılındı

    const secondResult = await consumePasswordResetToken(second);
    expect(secondResult?.userId).toBe(user.userId);
  });

  it("hiçbir ham (plaintext) kod dosyaya yazılmaz — yalnızca sha256 hash'i", async () => {
    const user = await findUserByEmail(EMAIL);
    if (!user) return;
    const raw = await createPasswordResetToken(user.tenantId, user.userId);

    const fileContents = await fs.readFile(PASSWORD_RESET_FILE, "utf8");
    expect(fileContents.includes(raw)).toBe(false);
    const rows = JSON.parse(fileContents) as Array<{ tokenHash: string }>;
    expect(rows.some((r) => r.tokenHash && r.tokenHash.length === 64)).toBe(true); // sha256 hex = 64 karakter
  });

  it("uçtan uca: kod ile gerçekten şifre değiştirilebilir (updatePasswordHash — changeOwnPassword ile AYNI yazma yolu), eski şifre artık çalışmaz", async () => {
    const user = await findUserByEmail(EMAIL);
    if (!user) return;
    const raw = await createPasswordResetToken(user.tenantId, user.userId);
    const consumed = await consumePasswordResetToken(raw);
    expect(consumed).not.toBeNull();

    const newHash = await hashPassword("brand-new-reset-pass-1");
    const updated = await updatePasswordHash(consumed!.userId, newHash);
    expect(updated).toBe(true);

    const withOld = await authenticateUser(EMAIL, ORIGINAL_PASSWORD);
    expect(withOld).toBeNull();
    const withNew = await authenticateUser(EMAIL, "brand-new-reset-pass-1");
    expect(withNew).not.toBeNull();

    // Restore so this test file doesn't leave permanent cross-test state (shared json store, fileParallelism:false).
    const restoreHash = await hashPassword(ORIGINAL_PASSWORD);
    await updatePasswordHash(user.userId, restoreHash);
    const restored = await authenticateUser(EMAIL, ORIGINAL_PASSWORD);
    expect(restored).not.toBeNull();
  });

  it("bir kullanıcı için üretilen kod BAŞKA bir kullanıcının şifresini değiştiremez", async () => {
    const userA = await findUserByEmail(EMAIL);
    const userB = await findUserByEmail(OTHER_EMAIL);
    if (!userA || !userB) return;

    const rawForA = await createPasswordResetToken(userA.tenantId, userA.userId);
    const consumed = await consumePasswordResetToken(rawForA);
    expect(consumed?.userId).toBe(userA.userId);
    expect(consumed?.userId).not.toBe(userB.userId);

    // B'nin şifresi hiç dokunulmamış olmalı.
    const bStillWorks = await authenticateUser(OTHER_EMAIL, OTHER_PASSWORD);
    expect(bStillWorks).not.toBeNull();

    // A'nın kodunu tükettik, restore et.
    const restoreHash = await hashPassword(ORIGINAL_PASSWORD);
    await updatePasswordHash(userA.userId, restoreHash);
  });
});

describe("isRateLimited", () => {
  it("pencere içinde limit üzerine gerçek istekleri sınırlar", () => {
    const key = `test-rl-${Date.now()}`;
    for (let i = 0; i < 3; i++) expect(isRateLimited(key, 3, 60_000)).toBe(false);
    expect(isRateLimited(key, 3, 60_000)).toBe(true);
  });
});

describe("POST /api/v1/auth/forgot-password — route katmanı, enumeration koruması", () => {
  it("var olan bir hesap için nötr başarı yanıtı döner", async () => {
    const res = await forgotPassword(req("/api/v1/auth/forgot-password", { email: "ada.yilmaz.demo@email.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.data.message).toBe("string");
  });

  it("var OLMAYAN bir hesap için AYNI status/gövde şeklini (nötr mesaj) döner — hesap varlığını sızdırmaz", async () => {
    const existing = await forgotPassword(req("/api/v1/auth/forgot-password", { email: "ada.yilmaz.demo@email.com" }));
    const missing = await forgotPassword(req("/api/v1/auth/forgot-password", { email: "hic-boyle-biri-yok-2@example.com" }));

    expect(existing.status).toBe(missing.status);
    const existingJson = await existing.json();
    const missingJson = await missing.json();
    expect(existingJson.ok).toBe(missingJson.ok);
    expect(existingJson.data.message).toBe(missingJson.data.message);
  });

  it("geçersiz e-posta formatı VALIDATION_ERROR döner", async () => {
    const res = await forgotPassword(req("/api/v1/auth/forgot-password", { email: "not-an-email" }));
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("geliştirme ortamında (NODE_ENV !== production) var olan hesap için devResetToken döner", async () => {
    const res = await forgotPassword(req("/api/v1/auth/forgot-password", { email: "kerem.sahin.demo@email.com" }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.data.devResetToken).toBe("string");
    expect(json.data.devResetToken).toHaveLength(8);
  });

  it("production'da devResetToken ASLA yanıta eklenmez (var olan hesap için bile)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const res = await forgotPassword(req("/api/v1/auth/forgot-password", { email: "nehir.kaya.demo@email.com" }));
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.devResetToken).toBeUndefined();
      expect(JSON.stringify(json)).not.toContain("devResetToken");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("POST /api/v1/auth/reset-password — route katmanı", () => {
  it("geçersiz kod jenerik hata döner (VALIDATION_ERROR, iç detay sızdırmaz)", async () => {
    const res = await resetPassword(req("/api/v1/auth/reset-password", { token: "WRONGCOD", newPassword: "yeterince-uzun-1" }));
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("çok kısa yeni şifre backend'de reddedilir (yalnızca istemci doğrulamasına güvenmez)", async () => {
    const forgot = await forgotPassword(req("/api/v1/auth/forgot-password", { email: "toprak.demir.demo@email.com" }));
    const forgotJson = await forgot.json();
    const code = forgotJson.data.devResetToken as string;
    expect(code).toBeTruthy();

    const res = await resetPassword(req("/api/v1/auth/reset-password", { token: code, newPassword: "short" }));
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_ERROR");

    // Kısa şifre reddedildiği için kod HALA tüketilmemiş olmalı — geçerli bir şifreyle tekrar denenebilir.
    const retry = await resetPassword(req("/api/v1/auth/reset-password", { token: code, newPassword: "gecerli-yeni-sifre-1" }));
    const retryJson = await retry.json();
    expect(retryJson.ok).toBe(true);

    // Restore
    const user = await findUserByEmail("toprak.demir.demo@email.com");
    if (user) await updatePasswordHash(user.userId, await hashPassword("demo-student-csv-4"));
  });

  it("uçtan uca: geçerli kod ile şifre sıfırlanır; eski şifre başarısız, yeni şifre başarılı; AYNI kod ikinci kez kullanılamaz", async () => {
    const email = "elif.aksoy.demo@email.com";
    const originalPassword = "demo-student-csv-5";

    const forgot = await forgotPassword(req("/api/v1/auth/forgot-password", { email }));
    const forgotJson = await forgot.json();
    const code = forgotJson.data.devResetToken as string;
    expect(code).toBeTruthy();

    const reset = await resetPassword(req("/api/v1/auth/reset-password", { token: code, newPassword: "yepyeni-sifre-123" }));
    expect(reset.status).toBe(200);
    const resetJson = await reset.json();
    expect(resetJson.ok).toBe(true);

    const withOld = await authenticateUser(email, originalPassword);
    expect(withOld).toBeNull();
    const withNew = await authenticateUser(email, "yepyeni-sifre-123");
    expect(withNew).not.toBeNull();

    // Aynı kod ikinci kez kullanılamaz.
    const reuse = await resetPassword(req("/api/v1/auth/reset-password", { token: code, newPassword: "baska-bir-sifre-456" }));
    const reuseJson = await reuse.json();
    expect(reuseJson.ok).toBe(false);

    // Restore
    const user = await findUserByEmail(email);
    if (user) await updatePasswordHash(user.userId, await hashPassword(originalPassword));
  });
});

// Test dosyası kendi ürettiği kod satırlarını temizler (paylaşılan JSON store).
afterAll(async () => {
  await fs.rm(PASSWORD_RESET_FILE, { force: true });
});
