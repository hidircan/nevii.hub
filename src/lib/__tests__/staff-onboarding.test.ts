/**
 * P0 personel onboarding revizyonu testleri (2026-09-11):
 * detaylı özlük/iletişim kaydı (il/ilçe/yakınlık), rol ataması
 * (server-side allowlist) ve portal davet süreci (mevcut invitation
 * altyapısı — yeni auth mekanizması yok).
 *
 * Katmanlar:
 *  1. Tool (`createStaffMemberTool` + portal seçenekleri, rol allowlist,
 *     duplicate kuralı, hesap bağlama).
 *  2. Davet/aktivasyon (`inviteStaffAccountTool`,
 *     `getStaffAccountStatusTool`, `setStaffAccountActiveTool`,
 *     `sendStaffPasswordResetTool`) — RBAC + idempotent yeniden gönderme.
 *  3. E-posta içeriği (`sendAccountInvitationEmail` + SCHOOL_ADMIN rolü) —
 *     local'de BLOKE (sahte başarı yok), personel karşılama metni doğru.
 *  4. Login/hero görünümü — dosya-içi assertion (hafif, render yok):
 *     "Ana sayfaya dön" href="/", hero marka satırı BRAND.shortName.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { sendAccountInvitationEmail } from "../auth/invitation";
import { setEmailTransportForTests } from "../email";
import type { EmailSendInput } from "../email/types";
import { DYNAMIC_USERS_FILE } from "../auth/dynamic-users";
import { STAFF_FILE, listStaff } from "../staff";
import {
  STAFF_PORTAL_ALLOWED_ROLES,
  createStaffMemberTool,
  getStaffAccountStatusTool,
  setStaffAccountActiveTool,
  inviteStaffAccountTool,
  sendStaffPasswordResetTool,
} from "../services/tools";
import type { ServiceContext } from "../services/context";
import { readFileSync } from "fs";

const PASSWORD_RESET_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "password-reset-tokens.json");

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  // 2026-09-12 rol sözleşmesi: personel yalnız kurum sahibinde (SUPER_ADMIN — Nilüfer Acar).
  return { role: "SUPER_ADMIN", userId: "user_owner_nilufer", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}
function teacherCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "TEACHER", userId: "u3", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web", ...overrides };
}

let emailSeq = 0;
function uniqueEmail(): string {
  emailSeq += 1;
  return `personel-onb-${emailSeq}@example.com`;
}

beforeEach(async () => {
  setEmailTransportForTests(null);
  await fs.rm(STAFF_FILE, { force: true });
  await fs.rm(DYNAMIC_USERS_FILE, { force: true });
  await fs.rm(PASSWORD_RESET_FILE, { force: true });
});

afterAll(async () => {
  setEmailTransportForTests(null);
  await fs.rm(STAFF_FILE, { force: true });
  await fs.rm(DYNAMIC_USERS_FILE, { force: true });
  await fs.rm(PASSWORD_RESET_FILE, { force: true });
});

describe("personel onboarding — yeni özlük alanları", () => {
  it("il/ilçe/yakınlık/işe giriş/durum kaydolur ve listede döner (eski kayıtlar kırılmaz)", async () => {
    const email = uniqueEmail();
    const created = await createStaffMemberTool(adminCtx(), {
      name: "Ayşe Yılmaz",
      position: "Muhasebe",
      email,
      phone: "0555 000 0000",
      birthDate: "1990-05-01",
      city: "İzmir",
      district: "Bornova",
      address: "Atatürk Mah. 1. Sok. No:2",
      department: "İdari işler",
      hireDate: "2024-09-01",
      employmentType: "full_time",
      status: "active",
      emergencyContactName: "Mehmet Yılmaz",
      emergencyContactRelationship: "Eşi",
      emergencyContactPhone: "0555 111 2233",
      personnelNotes: "Yönetici notu",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const staff = await listStaff(DEFAULT_TENANT_ID);
    const entry = staff.find((s) => s.id === created.data.staffId);
    expect(entry?.city).toBe("İzmir");
    expect(entry?.district).toBe("Bornova");
    expect(entry?.emergencyContactRelationship).toBe("Eşi");
    expect(entry?.hireDate).toBe("2024-09-01");
    expect(entry?.personnelNotes).toBe("Yönetici notu");
    expect(entry?.portalUserId).toBeUndefined();
  });
});

describe("personel onboarding — rol allowlist (server-side)", () => {
  it("yalnız SCHOOL_ADMIN izinlidir; SUPER_ADMIN engellenir", () => {
    expect([...STAFF_PORTAL_ALLOWED_ROLES]).toEqual(["SCHOOL_ADMIN"]);
  });

  it.each(["SUPER_ADMIN", "TEACHER", "STUDENT", "AI_AGENT"])("%s rolü reddedilir ama personel kaydı korunur", async (role) => {
    const email = uniqueEmail();
    const created = await createStaffMemberTool(adminCtx(), {
      name: "Rol Testi",
      position: "Resepsiyon",
      email,
      createPortalAccess: true,
      portalRole: role,
      sendInvitation: false,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.portal?.status).toBe("duplicate_blocked");

    const staff = await listStaff(DEFAULT_TENANT_ID);
    expect(staff.some((s) => s.id === created.data.staffId)).toBe(true);
    expect(staff.find((s) => s.id === created.data.staffId)?.portalUserId).toBeUndefined();
  });
});

describe("personel onboarding — portal erişimi ve davet", () => {
  it("portal işaretlenmezse hesap AÇILMAZ (e-posta dolu olsa bile)", async () => {
    const created = await createStaffMemberTool(adminCtx(), {
      name: "Hesapsız Personel",
      position: "Resepsiyon",
      email: uniqueEmail(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.portal?.status).toBe("skipped");

    const status = await getStaffAccountStatusTool(adminCtx(), { staffId: created.data.staffId });
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.data.exists).toBe(false);
  });

  it("portal erişimi + SCHOOL_ADMIN ile hesap oluşturulur ve personele bağlanır", async () => {
    const email = uniqueEmail();
    const created = await createStaffMemberTool(adminCtx(), {
      name: "Panelli Personel",
      position: "Muhasebe",
      email,
      createPortalAccess: true,
      portalRole: "SCHOOL_ADMIN",
      sendInvitation: false,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.portal?.status).toBe("created");

    const status = await getStaffAccountStatusTool(adminCtx(), { staffId: created.data.staffId });
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.data.exists).toBe(true);
    expect(status.data.email).toBe(email);
    expect(status.data.role).toBe("SCHOOL_ADMIN");
    expect(status.data.active).toBe(true);
  });

  it("aynı e-posta başka personele bağlıysa duplicate AÇILMAZ, uyarı döner", async () => {
    const email = uniqueEmail();
    const first = await createStaffMemberTool(adminCtx(), {
      name: "Birinci",
      position: "Muhasebe",
      email,
      createPortalAccess: true,
      portalRole: "SCHOOL_ADMIN",
      sendInvitation: false,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.portal?.status).toBe("created");

    const second = await createStaffMemberTool(adminCtx(), {
      name: "İkinci",
      position: "Resepsiyon",
      email,
      createPortalAccess: true,
      portalRole: "SCHOOL_ADMIN",
      sendInvitation: false,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.portal?.status).toBe("duplicate_blocked");

    const status = await getStaffAccountStatusTool(adminCtx(), { staffId: second.data.staffId });
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.data.exists).toBe(false);
  });

  it("farklı roldeki (öğretmen) e-postaya personel hesabı bağlanmaz", async () => {
    const created = await createStaffMemberTool(adminCtx(), {
      name: "Çakışan E-posta",
      position: "Resepsiyon",
      email: "turgay.hosbas@niluferacar.com.tr",
      createPortalAccess: true,
      portalRole: "SCHOOL_ADMIN",
      sendInvitation: false,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.portal?.status).toBe("duplicate_blocked");
  });

  it("davet ilk gönderimde portalInvitedAt yazar; yeniden gönderme idempotenttir", async () => {
    const email = uniqueEmail();
    const created = await createStaffMemberTool(adminCtx(), {
      name: "Davetli Personel",
      position: "Muhasebe",
      email,
      createPortalAccess: true,
      portalRole: "SCHOOL_ADMIN",
      sendInvitation: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // Local'de SMTP yok: kayıt oluşur ama teslim BLOKE olur (sahte başarı yok).
    expect(created.data.portal?.status).toBe("created");
    expect(created.data.portal).toMatchObject({ delivered: false });

    const before = await listStaff(DEFAULT_TENANT_ID);
    expect(before.find((s) => s.id === created.data.staffId)?.portalInvitedAt).toBeTruthy();

    const resend = await inviteStaffAccountTool(adminCtx(), { staffId: created.data.staffId });
    expect(resend.ok).toBe(true);
    if (!resend.ok) return;
    expect(resend.data.delivered).toBe(false);

    const status = await getStaffAccountStatusTool(adminCtx(), { staffId: created.data.staffId });
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.data.exists).toBe(true);
    expect(status.data.lastInvitedAt).toBeTruthy();
  });

  it("TEACHER rolü portal araçlarına erişemez (FORBIDDEN)", async () => {
    const created = await createStaffMemberTool(adminCtx(), { name: "Yetki Testi", position: "Muhasebe" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const invite = await inviteStaffAccountTool(teacherCtx(), { staffId: created.data.staffId });
    expect(invite.ok).toBe(false);
    const status = await getStaffAccountStatusTool(teacherCtx(), { staffId: created.data.staffId });
    expect(status.ok).toBe(false);
    const toggle = await setStaffAccountActiveTool(teacherCtx(), { staffId: created.data.staffId, active: false });
    expect(toggle.ok).toBe(false);
    const reset = await sendStaffPasswordResetTool(teacherCtx(), { staffId: created.data.staffId });
    expect(reset.ok).toBe(false);
  });

  it("erişim kapatılıp açılabilir; kapalıyken sıfırlama bağlantısı gönderilemez", async () => {
    const email = uniqueEmail();
    const created = await createStaffMemberTool(adminCtx(), {
      name: "Aç-Kapa Personel",
      position: "Muhasebe",
      email,
      createPortalAccess: true,
      portalRole: "SCHOOL_ADMIN",
      sendInvitation: false,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const closed = await setStaffAccountActiveTool(adminCtx(), { staffId: created.data.staffId, active: false });
    expect(closed.ok).toBe(true);

    const resetWhileClosed = await sendStaffPasswordResetTool(adminCtx(), { staffId: created.data.staffId });
    expect(resetWhileClosed.ok).toBe(false);

    const opened = await setStaffAccountActiveTool(adminCtx(), { staffId: created.data.staffId, active: true });
    expect(opened.ok).toBe(true);
  });
});

describe("personel davet e-postası — içerik ve local BLOKE davranışı", () => {
  it("SCHOOL_ADMIN daveti yönetim paneli metniyle gider; SMTP yoksa BLOKE (sahte başarı yok)", async () => {
    let captured: EmailSendInput | null = null;
    setEmailTransportForTests({
      name: "capture",
      async send(input: EmailSendInput) {
        captured = input;
        return { delivered: true, messageId: "test-id" };
      },
    });
    const result = await sendAccountInvitationEmail({
      tenantId: DEFAULT_TENANT_ID,
      userId: "user-test",
      email: "personel@example.com",
      recipientName: "Test Personel",
      institutionName: "Test Kurumu",
      role: "SCHOOL_ADMIN",
    });
    expect(result.delivered).toBe(true);
    expect(captured).not.toBeNull();
    expect(captured!.html).toContain("yönetim paneli hesabı");
    expect(captured!.html).not.toContain("Öğrenciniz için");
  });

  it("varsayılan transport local'de BLOKE döner", async () => {
    setEmailTransportForTests(null);
    const result = await sendAccountInvitationEmail({
      tenantId: DEFAULT_TENANT_ID,
      userId: "user-test",
      email: "personel@example.com",
      recipientName: "Test Personel",
      institutionName: "Test Kurumu",
      role: "SCHOOL_ADMIN",
    });
    expect(result.delivered).toBe(false);
  });
});

describe("login dönüş + hero marka satırı — görünüm sözleşmesi", () => {
  const ROOT = path.resolve(import.meta.dirname, "../../..");
  it("login ekranında href='/' olan görünür 'Ana sayfaya dön' bağlantısı var (form dışı)", () => {
    const code = readFileSync(path.join(ROOT, "src/app/login/page.tsx"), "utf-8");
    expect(code).toContain('href="/"');
    // 05c172d (kurum dili): metin i18n sözlüğünden gelir — bağlantı metni + Türkçe karşılık ayrı doğrulanır.
    expect(code).toContain("{copy.backHome}");
    expect(readFileSync(path.join(ROOT, "src/lib/i18n/copy.ts"), "utf-8")).toContain('backHome: "Ana sayfaya dön"');
    // Bağlantı LoginForm'un DIŞINDA (submit ile karışmaz).
    expect(code.indexOf('href="/"')).toBeLessThan(code.indexOf("<LoginForm"));
  });

  it("personel ekleme ayrı sayfadadır: liste butonu /panel/personel/yeni'ye gider", () => {
    const listPage = readFileSync(path.join(ROOT, "src/app/panel/personel/page.tsx"), "utf-8");
    expect(listPage).toContain('href="/panel/personel/yeni"');
    expect(listPage).toContain("Yeni personel ekle");
    const yeniPage = readFileSync(path.join(ROOT, "src/app/panel/personel/yeni/page.tsx"), "utf-8");
    expect(yeniPage).toContain("StaffCreateForm");
    // Liste bileşeni artık kayıt formu taşımaz (tek ekleme akışı).
    const manager = readFileSync(path.join(ROOT, "src/components/staff-manager.tsx"), "utf-8");
    expect(manager).not.toContain("actionCreateStaffMember");
    expect(manager).not.toContain('name="firstName"');
    const createForm = readFileSync(path.join(ROOT, "src/components/staff-create-form.tsx"), "utf-8");
    expect(createForm).toContain('name="firstName"');
    expect(createForm).toContain("actionCreateStaffMember");
  });

  it("hero marka satırı logo + BRAND.shortName kullanır; uppercase dönüşümü yok, yeni mekanizma yok", () => {
    // Yorumlar ayıklanır — "NEVİİHUB" tarihsel açıklaması yorumlarda geçebilir (brand-spelling.test.ts ile AYNI kural).
    const code = readFileSync(path.join(ROOT, "src/components/site/sections.tsx"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "$1");
    expect(code).toContain("BRAND.shortName");
    expect(code).toContain("BRAND.logoPath");
    expect(code).toContain("normal-case");
    expect(code).not.toContain("platform-brand");
    expect(code).not.toContain("NEVİİHUB");
  });
});
