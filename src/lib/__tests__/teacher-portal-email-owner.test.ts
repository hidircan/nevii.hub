/**
 * 2026-10-14 — Öğretmen PORTAL GİRİŞ e-postasını YALNIZ kurum sahibi değiştirir (`changeTeacherPortalEmailTool`).
 * Olay: öğretmenin iletişim e-postası (Teacher.email) değiştirildi ama giriş e-postası (User.email) eski kaldı; kaynak
 * koddaki adres değişikliği mevcut DB hesabını hiçbir zaman değiştirmez. Gerçek e-posta GÖNDERİLMEZ (mock transport);
 * yalnız sentetik `@ornek.test` adresleri kullanılır.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { AuthUser } from "../auth/types";
import { authenticateUser } from "../auth/users";
import { hashPasswordSync } from "../auth/password";
import { issueTokenPair } from "../auth/jwt";
import { setEmailTransportForTests } from "../email";
import type { EmailSendInput } from "../email/types";
import { consumePasswordResetToken, createPasswordResetToken } from "../auth/password-reset";
import { EMAIL_CHANGE_TOKENS_FILE, confirmEmailChange } from "../auth/email-change";
import { DYNAMIC_USERS_FILE, createDynamicUser, findDynamicUserByTeacherId } from "../auth/dynamic-users";
import { readTeacherPortalDetails } from "../store";
import { getUserLifecycle } from "../platform/store-ext";
import { changeTeacherPortalEmailTool, getTeacherAccountStatusTool, inviteTeacherAccountTool, updateTeacherProfileTool } from "../services/tools";
import { POST as requestEmailChangeRoute } from "../../app/api/v1/account/email-change/request/route";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const PASSWORD_RESET_FILE = path.join(DIR, "password-reset-tokens.json");
const TEACHER_ID = "tch_7epmkwtkfvi8";
const OLD = "ogretmen.eski@ornek.test";
const NEW = "ogretmen.yeni@ornek.test";
const PW = "ogretmen-sifre-123";

const ctx = (role: ServiceContext["role"], over: Partial<ServiceContext> = {}): ServiceContext => ({
  role,
  userId: role === "SUPER_ADMIN" ? "user_owner_nilufer" : "u1",
  tenantId: DEFAULT_TENANT_ID,
  channel: "web",
  ...over,
});
const owner = () => ctx("SUPER_ADMIN");

let sent: EmailSendInput[] = [];
beforeEach(async () => {
  for (const f of ["store.json"].map((x) => path.join(DIR, x)).concat([DYNAMIC_USERS_FILE, PASSWORD_RESET_FILE, EMAIL_CHANGE_TOKENS_FILE])) {
    await fs.rm(f, { force: true });
  }
  sent = [];
  setEmailTransportForTests({ name: "mock", async send(input) { sent.push(input); return { delivered: true }; } });
});
afterAll(() => setEmailTransportForTests(null));

async function activeTeacherAccount() {
  return createDynamicUser({ tenantId: DEFAULT_TENANT_ID, email: OLD, passwordHash: hashPasswordSync(PW), role: "TEACHER", teacherId: TEACHER_ID });
}
function verifyToken(): string {
  const mail = sent.find((m) => m.to === NEW);
  const t = mail?.html.match(/\/hesap-eposta-dogrula\?token=([^"'\s&]+)/)?.[1];
  if (!t) throw new Error("doğrulama bağlantısı yeni adrese gitmedi");
  return decodeURIComponent(t);
}

describe("yetki: yalnız kurum sahibi, yalnız kendi kurumu", () => {
  it("kurum yöneticisi, şube yöneticisi, öğretmen ve platform sahibi reddedilir; hiçbir şey değişmez", async () => {
    await activeTeacherAccount();
    for (const role of ["SCHOOL_ADMIN", "BRANCH_MANAGER", "TEACHER", "HYPER_ADMIN"] as const) {
      const res = await changeTeacherPortalEmailTool(ctx(role, role === "TEACHER" ? { teacherId: TEACHER_ID } : {}), { teacherId: TEACHER_ID, newEmail: NEW, confirm: true });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("FORBIDDEN");
        expect(res.error.message).toContain("yalnız kurum sahibi");
      }
    }
    expect(sent).toHaveLength(0);
    expect((await findDynamicUserByTeacherId(DEFAULT_TENANT_ID, TEACHER_ID))?.email).toBe(OLD);
  });

  it("başka kurumun sahibi bu öğretmenin hesabını değiştiremez", async () => {
    await activeTeacherAccount();
    const res = await changeTeacherPortalEmailTool(ctx("SUPER_ADMIN", { tenantId: "tenant_baska_kurum" }), { teacherId: TEACHER_ID, newEmail: NEW, confirm: true });
    expect(res.ok).toBe(false);
    expect(sent).toHaveLength(0);
    expect((await findDynamicUserByTeacherId(DEFAULT_TENANT_ID, TEACHER_ID))?.email).toBe(OLD);
  });

  it("açık onay olmadan değişiklik başlamaz", async () => {
    await activeTeacherAccount();
    const res = await changeTeacherPortalEmailTool(owner(), { teacherId: TEACHER_ID, newEmail: NEW });
    expect(res.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe("aktif hesap: yeni adres doğrulanana kadar değişiklik GERÇEKLEŞMEZ", () => {
  it("bekleyen yeni adres → doğrulama → yeni adresle giriş; eski adres, eski sıfırlama linki ve oturumlar geçersiz", async () => {
    const acc = await activeTeacherAccount();
    const oldResetCode = await createPasswordResetToken(DEFAULT_TENANT_ID, acc.userId);

    const res = await changeTeacherPortalEmailTool(owner(), { teacherId: TEACHER_ID, newEmail: NEW, confirm: true });
    expect(res.ok && res.data.mode).toBe("verification_sent");
    expect(sent.map((m) => m.to).sort()).toEqual([NEW, OLD].sort()); // yeni adrese doğrulama, eskiye güvenlik bildirimi

    // Sayfa yenileme: giriş hâlâ eski adres, yeni adres "bekleyen" olarak görünür.
    const pending = await getTeacherAccountStatusTool(owner(), { teacherId: TEACHER_ID });
    expect(pending.ok && [pending.data.email, pending.data.pendingEmailChange?.newEmail]).toEqual([OLD, NEW]);
    expect(await authenticateUser(NEW, PW)).toBeNull();

    expect((await confirmEmailChange(verifyToken())).ok).toBe(true);
    const after = await getTeacherAccountStatusTool(owner(), { teacherId: TEACHER_ID });
    expect(after.ok && [after.data.email, after.data.pendingEmailChange ?? null]).toEqual([NEW, null]);
    expect(await authenticateUser(NEW, PW)).not.toBeNull();
    expect(await authenticateUser(OLD, PW)).toBeNull();
    expect(await consumePasswordResetToken(oldResetCode)).toBeNull();
    expect((await getUserLifecycle(acc.userId))?.sessionsRevokedAt).toBeTruthy();
    // Öğretmen kimliği/ilişkisi aynı hesap.
    expect((await findDynamicUserByTeacherId(DEFAULT_TENANT_ID, TEACHER_ID))?.userId).toBe(acc.userId);
    // Doğrulama bağlantısı tek kullanımlık.
    expect((await confirmEmailChange(verifyToken())).ok).toBe(false);
  });

  it("yeni adres başka bir hesaba aitse (pasif dahil) reddedilir — birleştirme/devir yok", async () => {
    await activeTeacherAccount();
    const other = await createDynamicUser({ tenantId: DEFAULT_TENANT_ID, email: NEW, passwordHash: "x", role: "STUDENT", studentId: "s1" });
    expect(other.userId).toBeTruthy();
    const res = await changeTeacherPortalEmailTool(owner(), { teacherId: TEACHER_ID, newEmail: NEW, confirm: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("başka bir hesaba kayıtlı");
    expect(sent).toHaveLength(0);
  });

  it("profil (iletişim) e-postası düzenlemesi giriş adresini değiştirmez — kısıt bu yoldan aşılamaz", async () => {
    await activeTeacherAccount();
    expect((await updateTeacherProfileTool(ctx("SCHOOL_ADMIN"), { teacherId: TEACHER_ID, email: NEW })).ok).toBe(true);
    expect((await findDynamicUserByTeacherId(DEFAULT_TENANT_ID, TEACHER_ID))?.email).toBe(OLD);
    expect((await inviteTeacherAccountTool(ctx("SCHOOL_ADMIN"), { teacherId: TEACHER_ID })).ok).toBe(false);
    expect((await findDynamicUserByTeacherId(DEFAULT_TENANT_ID, TEACHER_ID))?.email).toBe(OLD);
  });
});

describe("bekleyen davetli hesap", () => {
  it("kurum sahibi değiştirir: giriş + davet adresi yeni, eski davet bağlantısı geçersiz, yeni davet ayrı onayla gider", async () => {
    const contact = (await readTeacherPortalDetails(TEACHER_ID))!.contactEmail;
    expect((await inviteTeacherAccountTool(owner(), { teacherId: TEACHER_ID })).ok).toBe(true);
    const oldCode = sent[0]?.text.match(/[?&]token=([A-Z0-9]+)/)?.[1];
    expect(oldCode).toBeTruthy();

    const res = await changeTeacherPortalEmailTool(owner(), { teacherId: TEACHER_ID, newEmail: NEW, confirm: true });
    expect(res.ok && res.data.mode).toBe("pending_invitation_updated");
    expect(sent).toHaveLength(1); // değişiklik kendiliğinden e-posta göndermez
    expect(await consumePasswordResetToken(oldCode!)).toBeNull();
    expect((await findDynamicUserByTeacherId(DEFAULT_TENANT_ID, TEACHER_ID))?.email).toBe(NEW);
    expect((await readTeacherPortalDetails(TEACHER_ID))?.contactEmail).toBe(NEW);
    expect(contact).not.toBe(NEW);

    expect((await inviteTeacherAccountTool(ctx("SCHOOL_ADMIN"), { teacherId: TEACHER_ID })).ok).toBe(true); // aynı adrese yeniden gönderim serbest
    expect(sent.at(-1)?.to).toBe(NEW);
  });
});

describe("öğretmen self-servis giriş e-postası değişikliği sunucuda kapalı", () => {
  it("TEACHER rolü /api/v1/account/email-change/request ile değiştiremez", async () => {
    const acc = await activeTeacherAccount();
    const user: AuthUser = { userId: acc.userId, role: "TEACHER", tenantId: DEFAULT_TENANT_ID, email: OLD, teacherId: TEACHER_ID } as AuthUser;
    const { accessToken } = await issueTokenPair(user);
    const res = await requestEmailChangeRoute(
      new Request("http://localhost/api/v1/account/email-change/request", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ currentPassword: PW, newEmail: NEW }),
      }),
      { params: Promise.resolve({}) } as never
    );
    const json = (await res.json()) as { ok: boolean; error?: { message: string } };
    expect(json.ok).toBe(false);
    expect(json.error?.message).toContain("yalnız kurum sahibi");
    expect(sent).toHaveLength(0);
  });
});

describe("güvenlik: aktif hesapta kalmış eski davet token'ı 'bekleyen davet' sayılmaz", () => {
  it("kurum sahibi aracı da davet aracı da giriş adresini DOĞRULAMASIZ değiştiremez", async () => {
    const acc = await activeTeacherAccount();
    await createPasswordResetToken(DEFAULT_TENANT_ID, acc.userId, 7 * 24 * 60 * 60 * 1000, "invitation"); // eski, kullanılmamış davet
    expect((await updateTeacherProfileTool(owner(), { teacherId: TEACHER_ID, email: NEW })).ok).toBe(true);

    const viaInvite = await inviteTeacherAccountTool(owner(), { teacherId: TEACHER_ID });
    expect(viaInvite.ok).toBe(false);
    expect((await findDynamicUserByTeacherId(DEFAULT_TENANT_ID, TEACHER_ID))?.email).toBe(OLD);

    const res = await changeTeacherPortalEmailTool(owner(), { teacherId: TEACHER_ID, newEmail: "ogretmen.ucuncu@ornek.test", confirm: true });
    expect(res.ok && res.data.mode).toBe("verification_sent");
    expect((await findDynamicUserByTeacherId(DEFAULT_TENANT_ID, TEACHER_ID))?.email).toBe(OLD);
    expect((await findDynamicUserByTeacherId(DEFAULT_TENANT_ID, TEACHER_ID))?.invitationPending).not.toBe(true);
  });

  it("çakışma mesajı adresin hangi kurumda/rolde olduğunu söylemez", async () => {
    await activeTeacherAccount();
    await createDynamicUser({ tenantId: DEFAULT_TENANT_ID, email: NEW, passwordHash: "x", role: "STUDENT", studentId: "s1" });
    const res = await changeTeacherPortalEmailTool(owner(), { teacherId: TEACHER_ID, newEmail: NEW, confirm: true });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).not.toContain(NEW);
      expect(res.error.message).not.toMatch(/öğrenci|STUDENT|kurum:/i);
    }
  });
});
