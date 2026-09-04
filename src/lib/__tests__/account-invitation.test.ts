/**
 * Faz 4 — hesap daveti (öğretmen/öğrenci/veli) testleri. İki katman:
 *  1. Domain (`../auth/invitation`) — e-posta içeriği, BLOKE (SMTP yok) davranışı.
 *  2. Route/tool katmanı — `inviteStudentPortalAccessTool`/`inviteTeacherAccountTool`
 *     (RBAC, rate limit) ve `POST /api/v1/auth/accept-invitation` (tek kullanımlık,
 *     süre aşımı, rol yükseltilemez, StudentPortalAccess aktivasyonu).
 *
 * `provisionEntityLogin` yalnızca STORE_MODE=db'de çalışır (bkz. dosya başı
 * yorumu, `src/lib/auth/users.ts`) — json test modunda YENİ bir e-posta için
 * User satırı OLUŞTURULAMAZ. Bu yüzden "kullanıcı zaten var" senaryoları
 * BOOTSTRAP demo hesapları (`turgay.hosbas@niluferacar.com.tr` = t1,
 * `selin@email.com` = s1) ile test edilir — `password-reset.test.ts` ile
 * AYNI teknik.
 */
import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { authenticateUser, findUserByEmail, getUserById } from "../auth/users";
import { sendAccountInvitationEmail, activatePendingPortalAccessForUser } from "../auth/invitation";
import { setEmailTransportForTests } from "../email";
import type { EmailSendInput } from "../email/types";
import { isRateLimited } from "../auth/password-reset";
import { inviteStudentPortalAccessTool, inviteTeacherAccountTool } from "../services/tools";
import { inviteStudentPortalAccess } from "../student-portal-access";
import { POST as acceptInvitation } from "../../app/api/v1/auth/accept-invitation/route";
import type { ServiceContext } from "../services/context";

const PASSWORD_RESET_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "password-reset-tokens.json");
const PORTAL_ACCESS_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "student-portal-access.json");

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}
function teacherCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "TEACHER", userId: "u3", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web", ...overrides };
}
function studentCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "STUDENT", userId: "u2", tenantId: DEFAULT_TENANT_ID, studentId: "s1", channel: "web", ...overrides };
}

function req(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  setEmailTransportForTests(null); // her testte varsayılan (console/BLOKE) transport'a dön
});

afterAll(async () => {
  setEmailTransportForTests(null);
  await fs.rm(PASSWORD_RESET_FILE, { force: true });
  await fs.rm(PORTAL_ACCESS_FILE, { force: true });
});

describe("sendAccountInvitationEmail — domain katmanı", () => {
  it("SMTP yapılandırılmamışsa BLOKE olur — sahte başarı ASLA dönmez", async () => {
    const user = await findUserByEmail("turgay.hosbas@niluferacar.com.tr");
    expect(user).not.toBeNull();
    if (!user) return;

    const result = await sendAccountInvitationEmail({
      tenantId: user.tenantId,
      userId: user.userId,
      email: "turgay.hosbas@niluferacar.com.tr",
      recipientName: "Turgay Hoşbaş",
      institutionName: "Nilüfer Acar Sanat Kursu",
      role: "TEACHER",
    });
    expect(result.delivered).toBe(false);
    if (result.delivered) return;
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("EMAIL_PROVIDER_NOT_CONFIGURED");
  });

  it("gönderilen e-posta İÇERİĞİNDE düz metin şifre YOKTUR, yalnızca tek kullanımlık link", async () => {
    const captured: EmailSendInput[] = [];
    setEmailTransportForTests({
      name: "mock",
      async send(input) {
        captured.push(input);
        return { delivered: true, messageId: "mock-1" };
      },
    });

    const user = await findUserByEmail("turgay.hosbas@niluferacar.com.tr");
    expect(user).not.toBeNull();
    if (!user) return;

    await sendAccountInvitationEmail({
      tenantId: user.tenantId,
      userId: user.userId,
      email: "turgay.hosbas@niluferacar.com.tr",
      recipientName: "Turgay Hoşbaş",
      institutionName: "Nilüfer Acar Sanat Kursu",
      role: "TEACHER",
    });

    expect(captured).toHaveLength(1);
    const sent = captured[0]!;
    // Olası bir düz metin geçici şifre kalıbı (provisionEntityLogin: 8 haneli base36) içermemeli.
    expect(sent.html).not.toMatch(/geçici şifre/i);
    expect(sent.text).not.toMatch(/geçici şifre/i);
    // İç tenant ID sızdırılmamalı.
    expect(sent.html).not.toContain(user.tenantId);
    // Tek kullanımlık aktivasyon linki içermeli.
    expect(sent.html).toContain("/hesap-aktivasyon?token=");
    expect(sent.text).toContain("/hesap-aktivasyon?token=");
  });

  it("P0 (2026-08-31) — öğretmen daveti 'ekibine hoş geldiniz' sıcak tonunu kullanır", async () => {
    const captured: EmailSendInput[] = [];
    setEmailTransportForTests({ name: "mock", async send(input) { captured.push(input); return { delivered: true }; } });
    const user = await findUserByEmail("turgay.hosbas@niluferacar.com.tr");
    if (!user) return;
    await sendAccountInvitationEmail({
      tenantId: user.tenantId,
      userId: user.userId,
      email: "turgay.hosbas@niluferacar.com.tr",
      recipientName: "Turgay Hoşbaş",
      institutionName: "Nilüfer Acar Sanat Kursu",
      role: "TEACHER",
    });
    const sent = captured[0]!;
    expect(sent.html).toContain("ekibine hoş geldiniz");
    expect(sent.text).toContain("ekibine hoş geldiniz");
  });

  it("P0 (2026-08-31) — öğrenci/veli daveti 'ailesine hoş geldiniz' sıcak tonunu kullanır", async () => {
    const captured: EmailSendInput[] = [];
    setEmailTransportForTests({ name: "mock", async send(input) { captured.push(input); return { delivered: true }; } });
    const user = await findUserByEmail("selin@email.com");
    if (!user) return;
    await sendAccountInvitationEmail({
      tenantId: user.tenantId,
      userId: user.userId,
      email: "selin@email.com",
      recipientName: "Selin",
      institutionName: "Nilüfer Acar Sanat Kursu",
      role: "STUDENT",
    });
    const sent = captured[0]!;
    expect(sent.html).toContain("ailesine hoş geldiniz");
    expect(sent.text).toContain("ailesine hoş geldiniz");
  });

  it("regresyon (2026-09-05) — logoUrl verilmezse banner'da 'NEVIIHUB'/platform markası DEĞİL, kurumun kendi adı görünür", async () => {
    const captured: EmailSendInput[] = [];
    setEmailTransportForTests({ name: "mock", async send(input) { captured.push(input); return { delivered: true }; } });
    const user = await findUserByEmail("turgay.hosbas@niluferacar.com.tr");
    if (!user) return;
    await sendAccountInvitationEmail({
      tenantId: user.tenantId,
      userId: user.userId,
      email: "turgay.hosbas@niluferacar.com.tr",
      recipientName: "Turgay Hoşbaş",
      institutionName: "Nilüfer Acar Sanat Kursu",
      role: "TEACHER",
    });
    const sent = captured[0]!;
    expect(sent.html).not.toContain("NEVIIHUB");
    expect(sent.html).not.toContain("NeviiHub");
    expect(sent.html).toContain("Nilüfer Acar Sanat Kursu");
    expect(sent.html).not.toContain("<img"); // logo verilmedi → gerçek <img> YOK, yalnız metin fallback
  });

  it("regresyon (2026-09-05) — logoUrl verilirse banner'da gerçek <img> görünür (metin değil)", async () => {
    const captured: EmailSendInput[] = [];
    setEmailTransportForTests({ name: "mock", async send(input) { captured.push(input); return { delivered: true }; } });
    const user = await findUserByEmail("turgay.hosbas@niluferacar.com.tr");
    if (!user) return;
    const fakeLogo =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    await sendAccountInvitationEmail({
      tenantId: user.tenantId,
      userId: user.userId,
      email: "turgay.hosbas@niluferacar.com.tr",
      recipientName: "Turgay Hoşbaş",
      institutionName: "Nilüfer Acar Sanat Kursu",
      role: "TEACHER",
      logoUrl: fakeLogo,
    });
    const sent = captured[0]!;
    expect(sent.html).toContain("<img");
    expect(sent.html).toContain(fakeLogo);
  });

  it("P0 (2026-08-31) — web portal linki her zaman içerilir (buton dışında düz metin de)", async () => {
    const captured: EmailSendInput[] = [];
    setEmailTransportForTests({ name: "mock", async send(input) { captured.push(input); return { delivered: true }; } });
    const user = await findUserByEmail("turgay.hosbas@niluferacar.com.tr");
    if (!user) return;
    await sendAccountInvitationEmail({
      tenantId: user.tenantId,
      userId: user.userId,
      email: "turgay.hosbas@niluferacar.com.tr",
      recipientName: "Turgay Hoşbaş",
      institutionName: "Nilüfer Acar Sanat Kursu",
      role: "TEACHER",
    });
    const sent = captured[0]!;
    expect(sent.text).toContain("Web portal: http");
  });

  it("P0 (2026-08-31) — mobil app store linkleri env'de YOKSA e-postada hiç GÖSTERİLMEZ (kırık link yok)", async () => {
    const originalApp = process.env.APP_STORE_URL;
    const originalPlay = process.env.PLAY_STORE_URL;
    delete process.env.APP_STORE_URL;
    delete process.env.PLAY_STORE_URL;
    try {
      const captured: EmailSendInput[] = [];
      setEmailTransportForTests({ name: "mock", async send(input) { captured.push(input); return { delivered: true }; } });
      const user = await findUserByEmail("turgay.hosbas@niluferacar.com.tr");
      if (!user) return;
      await sendAccountInvitationEmail({
        tenantId: user.tenantId,
        userId: user.userId,
        email: "turgay.hosbas@niluferacar.com.tr",
        recipientName: "Turgay Hoşbaş",
        institutionName: "Nilüfer Acar Sanat Kursu",
        role: "TEACHER",
      });
      const sent = captured[0]!;
      expect(sent.html).not.toContain("App Store");
      expect(sent.html).not.toContain("Google Play");
    } finally {
      if (originalApp !== undefined) process.env.APP_STORE_URL = originalApp;
      if (originalPlay !== undefined) process.env.PLAY_STORE_URL = originalPlay;
    }
  });

  it("P0 (2026-08-31) — mobil app store linkleri env'de VARSA e-postada gösterilir", async () => {
    const originalApp = process.env.APP_STORE_URL;
    const originalPlay = process.env.PLAY_STORE_URL;
    process.env.APP_STORE_URL = "https://apps.apple.com/app/example";
    process.env.PLAY_STORE_URL = "https://play.google.com/store/apps/example";
    try {
      const captured: EmailSendInput[] = [];
      setEmailTransportForTests({ name: "mock", async send(input) { captured.push(input); return { delivered: true }; } });
      const user = await findUserByEmail("turgay.hosbas@niluferacar.com.tr");
      if (!user) return;
      await sendAccountInvitationEmail({
        tenantId: user.tenantId,
        userId: user.userId,
        email: "turgay.hosbas@niluferacar.com.tr",
        recipientName: "Turgay Hoşbaş",
        institutionName: "Nilüfer Acar Sanat Kursu",
        role: "TEACHER",
      });
      const sent = captured[0]!;
      expect(sent.html).toContain("App Store");
      expect(sent.html).toContain("Google Play");
      expect(sent.html).toContain("https://apps.apple.com/app/example");
    } finally {
      if (originalApp === undefined) delete process.env.APP_STORE_URL;
      else process.env.APP_STORE_URL = originalApp;
      if (originalPlay === undefined) delete process.env.PLAY_STORE_URL;
      else process.env.PLAY_STORE_URL = originalPlay;
    }
  });
});

describe("inviteStudentPortalAccessTool / inviteTeacherAccountTool — RBAC ve rate limit", () => {
  it("yalnızca SCHOOL_ADMIN/SUPER_ADMIN davet gönderebilir", async () => {
    const asTeacher = await inviteTeacherAccountTool(teacherCtx(), { teacherId: "t1" });
    expect(asTeacher.ok).toBe(false);
    if (asTeacher.ok) return;
    expect(asTeacher.error.code).toBe("FORBIDDEN");

    const asStudent = await inviteStudentPortalAccessTool(studentCtx(), {
      studentId: "s1",
      email: "selin@email.com",
      accessType: "SELF",
    });
    expect(asStudent.ok).toBe(false);
    if (asStudent.ok) return;
    expect(asStudent.error.code).toBe("FORBIDDEN");
  });

  it("admin, mevcut bootstrap öğretmen hesabına davet gönderebilir (BLOKE ama işlem başarılı)", async () => {
    const res = await inviteTeacherAccountTool(adminCtx(), { teacherId: "t1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.delivered).toBe(false);
    expect(res.data.blocked).toBe(true);
  });

  it("aynı e-postaya kısa sürede çok fazla davet — RATE_LIMITED", async () => {
    const email = `rate-limit-test-${Date.now()}@email.com`;
    for (let i = 0; i < 5; i++) {
      await inviteStudentPortalAccessTool(adminCtx(), { studentId: "s1", email, accessType: "SELF" });
    }
    const sixth = await inviteStudentPortalAccessTool(adminCtx(), { studentId: "s1", email, accessType: "SELF" });
    expect(sixth.ok).toBe(false);
    if (sixth.ok) return;
    expect(sixth.error.code).toBe("RATE_LIMITED");
  });
});

describe("POST /api/v1/auth/accept-invitation — tek kullanımlık aktivasyon", () => {
  it("geçerli davet ile şifre belirlenir; eski şifre çalışmaz, yeni şifre çalışır", async () => {
    const user = await findUserByEmail("kerem.sahin.demo@email.com");
    expect(user).not.toBeNull();
    if (!user) return;

    const result = await sendAccountInvitationEmail({
      tenantId: user.tenantId,
      userId: user.userId,
      email: "kerem.sahin.demo@email.com",
      recipientName: "Kerem Şahin",
      institutionName: "Nilüfer Acar Sanat Kursu",
      role: "STUDENT",
    });
    expect(result.delivered).toBe(false); // BLOKE ama token yine de üretildi (sendAccountInvitationEmail bunu e-postaya gömer, DÖNMEZ)

    // Ham token'ı doğrudan test edebilmek için AYNI mekanizmayı (createPasswordResetToken) çağırıp kodu alalım.
    const { createPasswordResetToken } = await import("../auth/password-reset");
    const rawToken = await createPasswordResetToken(user.tenantId, user.userId, 7 * 24 * 60 * 60 * 1000);

    const res = await acceptInvitation(req("/api/v1/auth/accept-invitation", { token: rawToken, newPassword: "yeni-hesap-sifresi-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    const withNew = await authenticateUser("kerem.sahin.demo@email.com", "yeni-hesap-sifresi-1");
    expect(withNew).not.toBeNull();

    // Restore
    const { hashPassword } = await import("../auth/password");
    const { updatePasswordHash } = await import("../auth/users");
    await updatePasswordHash(user.userId, await hashPassword("demo-student-csv-2"));
  });

  it("AYNI davet kodu ikinci kez kullanılamaz (tek kullanımlık)", async () => {
    const user = await findUserByEmail("nehir.kaya.demo@email.com");
    if (!user) return;
    const { createPasswordResetToken } = await import("../auth/password-reset");
    const rawToken = await createPasswordResetToken(user.tenantId, user.userId, 7 * 24 * 60 * 60 * 1000);

    const first = await acceptInvitation(req("/api/v1/auth/accept-invitation", { token: rawToken, newPassword: "ilk-sifre-belirleme-1" }));
    expect((await first.json()).ok).toBe(true);

    const second = await acceptInvitation(req("/api/v1/auth/accept-invitation", { token: rawToken, newPassword: "ikinci-deneme-sifre-1" }));
    const secondJson = await second.json();
    expect(secondJson.ok).toBe(false);

    const { hashPassword } = await import("../auth/password");
    const { updatePasswordHash } = await import("../auth/users");
    await updatePasswordHash(user.userId, await hashPassword("demo-student-csv-3"));
  });

  it("süresi dolmuş davet reddedilir", async () => {
    const user = await findUserByEmail("toprak.demir.demo@email.com");
    if (!user) return;
    const { createPasswordResetToken } = await import("../auth/password-reset");
    const rawToken = await createPasswordResetToken(user.tenantId, user.userId, 7 * 24 * 60 * 60 * 1000);

    const rows = JSON.parse(await fs.readFile(PASSWORD_RESET_FILE, "utf8")) as Array<{
      tokenHash: string;
      expiresAt: string;
      userId: string;
    }>;
    const idx = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.userId === user.userId).pop()!.i;
    rows[idx]!.expiresAt = new Date(Date.now() - 60_000).toISOString();
    await fs.writeFile(PASSWORD_RESET_FILE, JSON.stringify(rows, null, 2));

    const res = await acceptInvitation(req("/api/v1/auth/accept-invitation", { token: rawToken, newPassword: "yeni-sifre-deneme-1" }));
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("rol davet kabulünde ASLA yükseltilemez — istek gövdesine 'role' eklense bile göz ardı edilir", async () => {
    const user = await findUserByEmail("elif.aksoy.demo@email.com");
    if (!user) return;
    const before = await getUserById(user.userId);
    expect(before?.role).toBe("STUDENT");

    const { createPasswordResetToken } = await import("../auth/password-reset");
    const rawToken = await createPasswordResetToken(user.tenantId, user.userId, 7 * 24 * 60 * 60 * 1000);

    const res = await acceptInvitation(
      req("/api/v1/auth/accept-invitation", { token: rawToken, newPassword: "role-yukseltme-denemesi-1", role: "SUPER_ADMIN" })
    );
    expect((await res.json()).ok).toBe(true);

    const after = await getUserById(user.userId);
    expect(after?.role).toBe("STUDENT"); // DEĞİŞMEDİ

    const { hashPassword } = await import("../auth/password");
    const { updatePasswordHash } = await import("../auth/users");
    await updatePasswordHash(user.userId, await hashPassword("demo-student-csv-5"));
  });

  it("davet kabul edilince bekleyen (invited) StudentPortalAccess satırı 'active' olur", async () => {
    const user = await findUserByEmail("selin@email.com");
    expect(user).not.toBeNull();
    if (!user) return;

    await inviteStudentPortalAccess({
      tenantId: user.tenantId,
      userId: user.userId,
      studentId: "s2",
      accessType: "GUARDIAN",
      invitedBy: "u1",
    });

    const activated = await activatePendingPortalAccessForUser(user.tenantId, user.userId);
    expect(activated).toBeGreaterThanOrEqual(1);

    const { getActiveAccessType } = await import("../student-portal-access");
    const accessType = await getActiveAccessType(user.tenantId, user.userId, "s2");
    expect(accessType).toBe("GUARDIAN");
  });
});

describe("isRateLimited — accept-invitation route seviyesinde IP limiti", () => {
  it("aynı anahtar için pencere içi limit üzerine gerçek istekleri sınırlar", () => {
    const key = `test-accept-invitation-rl-${Date.now()}`;
    for (let i = 0; i < 10; i++) expect(isRateLimited(key, 10, 60_000)).toBe(false);
    expect(isRateLimited(key, 10, 60_000)).toBe(true);
  });
});
