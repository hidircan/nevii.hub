import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { promises as fs } from "fs";
import {
  EMAIL_CHANGE_TOKENS_FILE,
  confirmEmailChange,
  requestEmailChange,
} from "../auth/email-change";
import { authenticateUser, getUserById, getUserIdByEmail } from "../auth/users";
import { DYNAMIC_USERS_FILE, createDynamicUser } from "../auth/dynamic-users";
import { setEmailTransportForTests } from "../email";
import type { EmailSendInput } from "../email/types";
import { DEFAULT_TENANT_ID } from "../auth/config";

/**
 * Hesabım — e-posta değiştirme akışı (2026-09-11).
 * Güvenlik: mevcut şifre + yeni adrese doğrulama + eski adrese bildirim,
 * tek kullanımlık 24s token, onayda yarış kontrolü.
 */
const sent: EmailSendInput[] = [];

beforeEach(async () => {
  sent.length = 0;
  setEmailTransportForTests({
    name: "capture",
    async send(input: EmailSendInput) {
      sent.push(input);
      return { delivered: true, messageId: "test-id" };
    },
  });
  await fs.rm(EMAIL_CHANGE_TOKENS_FILE, { force: true });
  await fs.rm(DYNAMIC_USERS_FILE, { force: true });
});

afterAll(async () => {
  setEmailTransportForTests(null);
  await fs.rm(EMAIL_CHANGE_TOKENS_FILE, { force: true });
  await fs.rm(DYNAMIC_USERS_FILE, { force: true });
});

async function createPortalUser(email: string): Promise<string> {
  const created = await createDynamicUser({
    tenantId: DEFAULT_TENANT_ID,
    email,
    passwordHash: "x",
    role: "STUDENT",
  });
  // Gerçek hash ile değiştir (şifre kontrolü doğrulansın).
  const { hashPasswordSync } = await import("../auth/password");
  const { setDynamicUserPasswordHash } = await import("../auth/dynamic-users");
  await setDynamicUserPasswordHash(created.userId, hashPasswordSync("sifre-1234"));
  return created.userId;
}

describe("e-posta değiştirme isteği", () => {
  it("yanlış mevcut şifre reddedilir", async () => {
    const userId = await createPortalUser("ogrenci-eski@example.com");
    const res = await requestEmailChange({
      tenantId: DEFAULT_TENANT_ID,
      userId,
      currentPassword: "yanlis-sifre",
      newEmail: "ogrenci-yeni@example.com",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("WRONG_PASSWORD");
  });

  it("aynı adres ve geçersiz adres reddedilir", async () => {
    const userId = await createPortalUser("ogrenci-eski@example.com");
    const same = await requestEmailChange({
      tenantId: DEFAULT_TENANT_ID,
      userId,
      currentPassword: "sifre-1234",
      newEmail: "OGRENCI-ESKI@example.com",
    });
    expect(same.ok).toBe(false);
    const invalid = await requestEmailChange({
      tenantId: DEFAULT_TENANT_ID,
      userId,
      currentPassword: "sifre-1234",
      newEmail: "gecersiz-adres",
    });
    expect(invalid.ok).toBe(false);
  });

  it("başka hesaba ait adres reddedilir (TAKEN)", async () => {
    const userId = await createPortalUser("ogrenci-eski@example.com");
    await createPortalUser("dolu@example.com");
    const res = await requestEmailChange({
      tenantId: DEFAULT_TENANT_ID,
      userId,
      currentPassword: "sifre-1234",
      newEmail: "dolu@example.com",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TAKEN");
  });

  it("başarılı istek: YENİ adrese doğrulama + ESKİ adrese güvenlik bildirimi gider", async () => {
    const userId = await createPortalUser("ogrenci-eski@example.com");
    const res = await requestEmailChange({
      tenantId: DEFAULT_TENANT_ID,
      userId,
      currentPassword: "sifre-1234",
      newEmail: "ogrenci-yeni@example.com",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.sentToNew).toBe(true);
    expect(res.notifiedOld).toBe(true);
    const toNew = sent.find((m) => m.to === "ogrenci-yeni@example.com");
    const toOld = sent.find((m) => m.to === "ogrenci-eski@example.com");
    expect(toNew?.html).toContain("/hesap-eposta-dogrula?token=");
    expect(toOld?.subject).toContain("değiştirilmek isteniyor");
    // Adres, onaylanana kadar DEĞİŞMEZ.
    expect((await getUserById(userId))?.email).toBe("ogrenci-eski@example.com");
  });
});

function extractToken(html: string): string {
  const m = html.match(/\/hesap-eposta-dogrula\?token=([^"'\s&]+)/);
  if (!m?.[1]) throw new Error("doğrulama bağlantısı e-postada yok");
  return decodeURIComponent(m[1]);
}

describe("e-posta değiştirme onayı", () => {
  it("geçerli token adresi değiştirir; yeni adresle giriş yapılır, eskiyle yapılamaz", async () => {
    const userId = await createPortalUser("degisim-eski@example.com");
    const req = await requestEmailChange({
      tenantId: DEFAULT_TENANT_ID,
      userId,
      currentPassword: "sifre-1234",
      newEmail: "degisim-yeni@example.com",
    });
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    const token = extractToken(sent.find((m) => m.to === "degisim-yeni@example.com")?.html ?? "");

    const confirmed = await confirmEmailChange(token);
    expect(confirmed.ok).toBe(true);
    expect((await getUserById(userId))?.email).toBe("degisim-yeni@example.com");
    expect(await getUserIdByEmail(DEFAULT_TENANT_ID, "degisim-yeni@example.com")).toBe(userId);

    const loginNew = await authenticateUser("degisim-yeni@example.com", "sifre-1234");
    expect(loginNew?.userId).toBe(userId);
    const loginOld = await authenticateUser("degisim-eski@example.com", "sifre-1234");
    expect(loginOld).toBeNull();
  });

  it("token tek kullanımlıktır — ikinci onay reddedilir", async () => {
    const userId = await createPortalUser("tekil-eski@example.com");
    await requestEmailChange({
      tenantId: DEFAULT_TENANT_ID,
      userId,
      currentPassword: "sifre-1234",
      newEmail: "tekil-yeni@example.com",
    });
    const token = extractToken(sent.find((m) => m.to === "tekil-yeni@example.com")?.html ?? "");
    expect((await confirmEmailChange(token)).ok).toBe(true);
    const second = await confirmEmailChange(token);
    expect(second.ok).toBe(false);
  });

  it("süresi dolmuş token reddedilir", async () => {
    const userId = await createPortalUser("sureli-eski@example.com");
    await requestEmailChange({
      tenantId: DEFAULT_TENANT_ID,
      userId,
      currentPassword: "sifre-1234",
      newEmail: "sureli-yeni@example.com",
    });
    const rows = JSON.parse(await fs.readFile(EMAIL_CHANGE_TOKENS_FILE, "utf8")) as { expiresAt: string }[];
    rows[0]!.expiresAt = new Date(Date.now() - 1000).toISOString();
    await fs.writeFile(EMAIL_CHANGE_TOKENS_FILE, JSON.stringify(rows, null, 2));
    const token = extractToken(sent.find((m) => m.to === "sureli-yeni@example.com")?.html ?? "");
    const res = await confirmEmailChange(token);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("EXPIRED");
    expect((await getUserById(userId))?.email).toBe("sureli-eski@example.com");
  });

  it("bilinmeyen token reddedilir", async () => {
    const res = await confirmEmailChange("bu-token-hic-uretilmedi-1234567890");
    expect(res.ok).toBe(false);
  });
});
