/**
 * Portal Erişim Yönetimi — CEO görev talebi (2026-08-31). Panel admin'in
 * öğrenci/öğretmen detay ekranından erişim aç/kapat, davet gönder/yeniden
 * gönder, admin-tetikli şifre sıfırlama yapabilmesini kapsar.
 *
 * Görev talebindeki 12 zorunlu senaryonun bu dosyadaki karşılığı:
 *  1. Mevcut öğrenci için erişim açma        → describe "Öğrenci — erişim aç/kapat"
 *  2. Mevcut öğrenci için erişim kapatma     → describe "Öğrenci — erişim aç/kapat"
 *  3. Davet gönder + yeniden gönder           → describe "Öğrenci — davet gönder/yeniden gönder"
 *  4. E-posta yokken davet/sıfırlama engeli   → describe "E-posta yok → engel"
 *  5. Davet e-postası gönderim hatası (UI'a sızdırmadan) → describe "Gönderim hatası"
 *  6. Şifre sıfırlama token'ı oluşturma (admin-tetikli) → describe "Admin-tetikli şifre sıfırlama"
 *  7. Süresi dolmuş token reddi                          → aynı describe
 *  8. İkinci kullanımda token reddi                      → aynı describe
 *  9. Öğretmen erişim aç/kapat + davet         → describe "Öğretmen — erişim aç/kapat/davet"
 *  10. Yetkisiz kullanıcı bu uçlara erişemez   → describe "RBAC"
 *  11. Aynı e-posta hesap çakışması             → describe "E-posta çakışması"
 *  12. Erişimi kapalı kullanıcı giriş yapamaz  → describe "Öğretmen — erişim aç/kapat/davet" (login testi)
 *
 * Not: token oluşturma/süre aşımı/tek kullanımlıkla ilgili DOMAIN katmanı
 * (`createPasswordResetToken`/`consumePasswordResetToken`) zaten
 * `password-reset.test.ts`de ayrıntılı test edilmiş — burada YENİ olan
 * ADMIN-TETİKLİ yol (`sendStudentPortalPasswordResetTool`) doğrulanır; kod,
 * mock e-posta transport'unun yakaladığı gövdeden çıkarılır. Gerçek e-posta
 * ASLA gönderilmez (`setEmailTransportForTests`), gerçek kullanıcı e-postası
 * log/test çıktısına yazılmaz (yalnızca demo/bootstrap adresleri kullanılır).
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { authenticateUser } from "../auth/users";
import { setEmailTransportForTests } from "../email";
import type { EmailSendInput } from "../email/types";
import { consumePasswordResetToken } from "../auth/password-reset";
import { passwordResetMail } from "../i18n/copy";
import { STUDENT_PORTAL_ACCESS_FILE, hasActiveStudentAccess } from "../student-portal-access";
import { DYNAMIC_USERS_FILE, findDynamicUserByEmail, findDynamicUserByTeacherId, createDynamicUser } from "../auth/dynamic-users";
import { updateTeacherProfile } from "../store";
import { grantStudentAccess } from "./portal-access-test-helper";
import {
  getStudentPortalAccessTool,
  revokeStudentPortalAccessTool,
  reactivateStudentPortalAccessTool,
  inviteStudentPortalAccessTool,
  sendStudentPortalPasswordResetTool,
  getTeacherAccountStatusTool,
  setTeacherAccountActiveTool,
  inviteTeacherAccountTool,
  sendTeacherPasswordResetTool,
} from "../services/tools";

const PASSWORD_RESET_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "password-reset-tokens.json");
// Kok neden duzeltmesi (2026-08-31): bu dosyanin beforeEach'i ana veri
// deposunu (store.json — ogretmen/ogrenci fixture'lari, orn. t7'nin
// e-postasi) hicbir zaman sifirlamiyordu; sibling test dosyalari
// (find-person-schedule.test.ts, homework-attachment.test.ts) bunu zaten
// yapiyor. fileParallelism:false altinda TUM dosyalar AYNI store.json'u
// paylastigindan, bu dosyadan once calisan baska bir test store.json'u
// silmeden birakirsa (ya da mutasyona ugratirsa) buradaki testler o STALE
// veriyi devralabiliyordu — "t7 e-postasi bos" onkosul hatasinin kok nedeni
// buydu (kod regresyonu degil, izolasyon eksikligi).
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}
function teacherCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "TEACHER", userId: "user_teacher_t1", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web", ...overrides };
}
function targetCtx(userId: string, overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "STUDENT", userId, tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

/** Admin-tetikli şifre sıfırlama e-postasının gövdesinden 8 haneli kodu çıkarır (testte token yakalamanın tek yolu — hash geri çevrilemez). Etiket, ürünün gerçek i18n metninden alınır (10. tur: "Kodunuz:" sabit metni şablon i18n'e taşınınca bayatlamıştı — işlevsellik değil test yardımcısı eskimişti). */
function extractResetCode(input: EmailSendInput): string {
  const label = passwordResetMail("tr", "").codeLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = input.text.match(new RegExp(`${label}\\s*([A-Z0-9]{8})`));
  if (!match) throw new Error("test: sıfırlama kodu e-posta gövdesinde bulunamadı");
  return match[1]!;
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  await fs.rm(DYNAMIC_USERS_FILE, { force: true });
  setEmailTransportForTests(null);
});

afterAll(async () => {
  setEmailTransportForTests(null);
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  await fs.rm(DYNAMIC_USERS_FILE, { force: true });
  await fs.rm(PASSWORD_RESET_FILE, { force: true });
  // t7'nin durumunu bu dosyanın testleri ne olursa olsun AÇIK bırak — process-ömürlü
  // activeOverrides başka test dosyalarını etkilemesin.
  await setTeacherAccountActiveTool(adminCtx(), { teacherId: "t7", active: true });
});

describe("1-2. Öğrenci — erişim aç/kapat (mevcut öğrenci)", () => {
  const STUDENT_ID = "s1";
  const USER_ID = "test-guardian-open-close";

  it("erişimi kapatmak (revoke): durum 'revoked' olur, hasActiveStudentAccess false döner, veri SİLİNMEZ", async () => {
    await grantStudentAccess(targetCtx(USER_ID), STUDENT_ID, "GUARDIAN");
    expect(await hasActiveStudentAccess(DEFAULT_TENANT_ID, USER_ID, STUDENT_ID)).toBe(true);

    const revoke = await revokeStudentPortalAccessTool(adminCtx(), { studentId: STUDENT_ID, userId: USER_ID });
    expect(revoke.ok).toBe(true);
    expect(await hasActiveStudentAccess(DEFAULT_TENANT_ID, USER_ID, STUDENT_ID)).toBe(false);

    const summary = await getStudentPortalAccessTool(adminCtx(), { studentId: STUDENT_ID });
    expect(summary.ok).toBe(true);
    if (summary.ok) {
      const row = summary.data.accounts.find((a) => a.userId === USER_ID);
      expect(row?.status).toBe("revoked");
      expect(row?.revokedAt).not.toBeNull();
    }
  });

  it("erişimi yeniden açmak (reactivate): MEVCUT kaydı etkinleştirir — yeni bir kopya oluşturmaz", async () => {
    await grantStudentAccess(targetCtx(USER_ID), STUDENT_ID, "GUARDIAN");
    await revokeStudentPortalAccessTool(adminCtx(), { studentId: STUDENT_ID, userId: USER_ID });

    const reactivate = await reactivateStudentPortalAccessTool(adminCtx(), { studentId: STUDENT_ID, userId: USER_ID });
    expect(reactivate.ok).toBe(true);
    expect(await hasActiveStudentAccess(DEFAULT_TENANT_ID, USER_ID, STUDENT_ID)).toBe(true);

    const summary = await getStudentPortalAccessTool(adminCtx(), { studentId: STUDENT_ID });
    expect(summary.ok).toBe(true);
    if (summary.ok) {
      // Aynı userId için TEK kayıt olmalı (yinelenen/kopya hesap YOK).
      const rows = summary.data.accounts.filter((a) => a.userId === USER_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe("active");
      expect(rows[0]?.accessType).toBe("GUARDIAN"); // korunmuş, değişmemiş
    }
  });

  it("olmayan bir erişim kaydını kapatmak/açmak NOT_FOUND döner", async () => {
    const revoke = await revokeStudentPortalAccessTool(adminCtx(), { studentId: STUDENT_ID, userId: "hic-boyle-bir-kayit-yok" });
    expect(revoke.ok).toBe(false);
    if (!revoke.ok) expect(revoke.error.code).toBe("NOT_FOUND");
  });
});

describe("3. Öğrenci — davet gönder / yeniden gönder", () => {
  it("davet iki kez gönderilebilir (ilk gönderim + yeniden gönder), her ikisi de e-posta transport'una ulaşır", async () => {
    const captured: EmailSendInput[] = [];
    setEmailTransportForTests({
      name: "mock",
      async send(input) {
        captured.push(input);
        return { delivered: true, messageId: "mock-invite" };
      },
    });

    const first = await inviteStudentPortalAccessTool(adminCtx(), {
      studentId: "s1",
      email: "selin@email.com", // mevcut bootstrap hesabı (user_parent_s1, role STUDENT) — yeni kayıt oluşturmaya gerek yok
      accessType: "GUARDIAN",
    });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.data.delivered).toBe(true);

    const resend = await inviteStudentPortalAccessTool(adminCtx(), {
      studentId: "s1",
      email: "selin@email.com",
      accessType: "GUARDIAN",
    });
    expect(resend.ok).toBe(true);
    if (resend.ok) expect(resend.data.delivered).toBe(true);

    expect(captured).toHaveLength(2);
    expect(captured.every((c) => c.to === "selin@email.com")).toBe(true);
  });
});

describe("4. E-posta yok → davet/sıfırlama engellenir", () => {
  it("davet: boş e-posta VALIDATION_ERROR ile reddedilir (şema seviyesinde)", async () => {
    const res = await inviteStudentPortalAccessTool(adminCtx(), { studentId: "s1", email: "", accessType: "GUARDIAN" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("admin-tetikli şifre sıfırlama: erişimi olan ama User kaydında e-postası olmayan bir kullanıcı için net bir hata döner (asla sahte başarı)", async () => {
    const USER_ID = "test-guardian-no-email"; // HASHED bootstrap dizisinde YOK → getUserAccountStatus null/email boş döner
    await grantStudentAccess(targetCtx(USER_ID), "s1", "GUARDIAN");

    const res = await sendStudentPortalPasswordResetTool(adminCtx(), { studentId: "s1", userId: USER_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("VALIDATION_ERROR");
      expect(res.error.message).toContain("e-posta");
    }
  });

  it("öğretmen daveti: Teacher kaydında e-posta tanımlı değilse net bir hata döner", async () => {
    const { readData } = await import("../store");
    const originalEmail = (await readData()).teachers.find((t) => t.id === "t7")?.email ?? "";
    expect(originalEmail).not.toBe(""); // ön koşul: normalde e-postası var

    try {
      await updateTeacherProfile("t7", { email: "" });
      const res = await inviteTeacherAccountTool(adminCtx(), { teacherId: "t7" });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("VALIDATION_ERROR");
        expect(res.error.message).toContain("e-posta");
      }
    } finally {
      await updateTeacherProfile("t7", { email: originalEmail });
    }
  });
});

describe("5. Davet/sıfırlama gönderim hatası — admin'e net gösterilir, sağlayıcı detayı sızdırılmaz", () => {
  it("transport BAŞARISIZ olduğunda (SMTP hatası benzeri) tool sonucu delivered:false döner ve HAM sağlayıcı hata metnini İÇERMEZ", async () => {
    const SENSITIVE = "SMTP AUTH FAILED user=svc-mailer pass=hunter2-super-secret";
    setEmailTransportForTests({
      name: "mock-fail",
      async send() {
        return { delivered: false, blocked: false, reason: SENSITIVE };
      },
    });

    // Not: `sendStudentPortalPasswordResetTool` gönderim denemesinden ÖNCE gerçek bir
    // e-postası olan bir hesap arar (`getUserAccountStatus`) — bu yüzden burada e-postası
    // OLMAYAN bir sentetik userId kullanmak "e-posta yok" hatasına düşer, e-posta gönderim
    // hatasına DEĞİL. Gerçek bir dynamic user oluşturup StudentPortalAccess'i ONA bağlıyoruz.
    const dynUser = await createDynamicUser({
      tenantId: DEFAULT_TENANT_ID,
      email: "gonderim.hatasi.testi@ornek.test",
      passwordHash: "test-hash-not-used",
      role: "STUDENT",
    });
    await grantStudentAccess(targetCtx(dynUser.userId), "s1", "GUARDIAN");

    const res = await sendStudentPortalPasswordResetTool(adminCtx(), { studentId: "s1", userId: dynUser.userId });
    expect(res.ok).toBe(true); // araç çağrısı başarılı — yalnızca e-posta TESLİM edilemedi, admin'e AÇIK biçimde gösterilir
    if (res.ok) {
      expect(res.data.delivered).toBe(false);
    }
    // Sağlayıcının ham/hassas hata metni hiçbir yerde (ServiceResult JSON'ında) YER ALMAMALI.
    expect(JSON.stringify(res)).not.toContain("hunter2");
    expect(JSON.stringify(res)).not.toContain("SMTP AUTH FAILED");
  });

  it("SMTP hiç yapılandırılmamışsa (varsayılan/BLOKE transport) davet delivered:false + blocked:true döner, sahte başarı YOK", async () => {
    setEmailTransportForTests(null); // varsayılan console/BLOKE transport'a dön
    const res = await inviteStudentPortalAccessTool(adminCtx(), { studentId: "s1", email: "selin@email.com", accessType: "GUARDIAN" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.delivered).toBe(false);
      expect(res.data.blocked).toBe(true);
    }
  });
});

describe("6-8. Admin-tetikli şifre sıfırlama — token oluşturma / süre aşımı / tek kullanımlıkla", () => {
  const STUDENT_ID = "s1";
  // Not: `sendStudentPortalPasswordResetTool` GERÇEK bir e-postalı hesap gerektirir
  // (bkz. test 5'teki AYNI kök neden notu) — bu yüzden sentetik bir userId YERİNE
  // her testte TAZE bir dynamic user oluşturulur (e-posta olmadan token/e-posta akışı
  // hiç test edilemez, "add email" hatasına düşer).
  let USER_ID: string;

  beforeEach(async () => {
    const dynUser = await createDynamicUser({
      tenantId: DEFAULT_TENANT_ID,
      email: "sifirlama.akisi.testi@ornek.test",
      passwordHash: "test-hash-not-used",
      role: "STUDENT",
    });
    USER_ID = dynUser.userId;
    await grantStudentAccess(targetCtx(USER_ID), STUDENT_ID, "GUARDIAN");
  });

  it("6. admin 'şifre sıfırlama bağlantısı gönder'e bastığında GERÇEK, tek kullanımlık bir kod üretilir ve e-postayla iletilir", async () => {
    const captured: EmailSendInput[] = [];
    setEmailTransportForTests({
      name: "mock",
      async send(input) {
        captured.push(input);
        return { delivered: true, messageId: "mock-reset" };
      },
    });

    const res = await sendStudentPortalPasswordResetTool(adminCtx(), { studentId: STUDENT_ID, userId: USER_ID });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.delivered).toBe(true);
    expect(captured).toHaveLength(1);

    const code = extractResetCode(captured[0]!);
    expect(code).toHaveLength(8);
    // Ham kod dosyaya YAZILMAZ, yalnızca sha256 hash'i (password-reset.test.ts'de ayrıca doğrulanıyor).
    const consumed = await consumePasswordResetToken(code);
    expect(consumed?.userId).toBe(USER_ID);
  });

  it("7. süresi dolmuş (30 dakikayı geçmiş) bir kod reddedilir", async () => {
    const captured: EmailSendInput[] = [];
    setEmailTransportForTests({ name: "mock", async send(input) { captured.push(input); return { delivered: true }; } });
    await sendStudentPortalPasswordResetTool(adminCtx(), { studentId: STUDENT_ID, userId: USER_ID });
    const code = extractResetCode(captured[0]!);

    const rows = JSON.parse(await fs.readFile(PASSWORD_RESET_FILE, "utf8")) as Array<{ userId: string; expiresAt: string }>;
    const targetIdx = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.userId === USER_ID).pop()!.i;
    rows[targetIdx]!.expiresAt = new Date(Date.now() - 60_000).toISOString();
    await fs.writeFile(PASSWORD_RESET_FILE, JSON.stringify(rows, null, 2));

    const result = await consumePasswordResetToken(code);
    expect(result).toBeNull();
  });

  it("8. bir kod bir kez tüketildikten sonra İKİNCİ kez kullanılamaz", async () => {
    const captured: EmailSendInput[] = [];
    setEmailTransportForTests({ name: "mock", async send(input) { captured.push(input); return { delivered: true }; } });
    await sendStudentPortalPasswordResetTool(adminCtx(), { studentId: STUDENT_ID, userId: USER_ID });
    const code = extractResetCode(captured[0]!);

    const first = await consumePasswordResetToken(code);
    expect(first?.userId).toBe(USER_ID);
    const second = await consumePasswordResetToken(code);
    expect(second).toBeNull();
  });

  it("erişim kapalıyken (revoked) şifre sıfırlama bağlantısı GÖNDERİLEMEZ — önce erişim açılmalı", async () => {
    await revokeStudentPortalAccessTool(adminCtx(), { studentId: STUDENT_ID, userId: USER_ID });
    const res = await sendStudentPortalPasswordResetTool(adminCtx(), { studentId: STUDENT_ID, userId: USER_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("9 & 12. Öğretmen — erişim aç/kapat/davet, kapalıyken giriş yapamaz", () => {
  const TEACHER_ID = "t7";
  const TEACHER_USER_ID = "user_teacher_t7";
  const TEACHER_EMAIL = "pinar.celik@niluferacar.com.tr";
  const TEACHER_PASSWORD = "demo-teacher-csv-7";

  it("erişimi kapatmak (active:false) girişi HEMEN engeller; yeniden açmak (active:true) girişe İZİN verir — ders/program/yoklama verisi SİLİNMEZ", async () => {
    // Ön koşul — açık başla.
    await setTeacherAccountActiveTool(adminCtx(), { teacherId: TEACHER_ID, active: true });
    const loginBefore = await authenticateUser(TEACHER_EMAIL, TEACHER_PASSWORD);
    expect(loginBefore).not.toBeNull();

    const closeRes = await setTeacherAccountActiveTool(adminCtx(), { teacherId: TEACHER_ID, active: false });
    expect(closeRes.ok).toBe(true);
    if (closeRes.ok) expect(closeRes.data.active).toBe(false);

    const statusClosed = await getTeacherAccountStatusTool(adminCtx(), { teacherId: TEACHER_ID });
    expect(statusClosed.ok).toBe(true);
    if (statusClosed.ok) expect(statusClosed.data.active).toBe(false);

    // 12. Erişimi kapalı öğretmen ARTIK giriş yapamaz.
    const loginBlocked = await authenticateUser(TEACHER_EMAIL, TEACHER_PASSWORD);
    expect(loginBlocked).toBeNull();

    const openRes = await setTeacherAccountActiveTool(adminCtx(), { teacherId: TEACHER_ID, active: true });
    expect(openRes.ok).toBe(true);

    // Yeniden açılınca giriş TEKRAR çalışır — MEVCUT hesap yeniden etkinleştirildi, yeni hesap oluşturulmadı.
    const loginRestored = await authenticateUser(TEACHER_EMAIL, TEACHER_PASSWORD);
    expect(loginRestored).not.toBeNull();
    expect(loginRestored?.userId).toBe(TEACHER_USER_ID);
  });

  it("öğretmen daveti öğrenci şablonuyla KARIŞMAZ — role uygun ('ekibine hoş geldiniz') içerik gönderilir", async () => {
    const captured: EmailSendInput[] = [];
    setEmailTransportForTests({
      name: "mock",
      async send(input) {
        captured.push(input);
        return { delivered: true, messageId: "mock-teacher-invite" };
      },
    });

    const res = await inviteTeacherAccountTool(adminCtx(), { teacherId: TEACHER_ID });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.delivered).toBe(true);

    expect(captured).toHaveLength(1);
    const email = captured[0]!;
    expect(email.to).toBe(TEACHER_EMAIL);
    expect(email.text).toContain("ekibine hoş geldiniz"); // öğretmen şablonu
    expect(email.text).not.toContain("ailesine hoş geldiniz"); // öğrenci/veli şablonuyla KARIŞMADI
  });
});

describe("10. RBAC — yetkisiz kullanıcı bu uçlara erişemez", () => {
  it("TEACHER rolü admin-only portal erişim araçlarını çağıramaz (FORBIDDEN)", async () => {
    const ctx = teacherCtx();

    const r1 = await getStudentPortalAccessTool(ctx, { studentId: "s1" });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe("FORBIDDEN");

    const r2 = await revokeStudentPortalAccessTool(ctx, { studentId: "s1", userId: "user_parent_s1" });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("FORBIDDEN");

    const r3 = await setTeacherAccountActiveTool(ctx, { teacherId: "t7", active: false });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error.code).toBe("FORBIDDEN");

    const r4 = await sendTeacherPasswordResetTool(ctx, { teacherId: "t7" });
    expect(r4.ok).toBe(false);
    if (!r4.ok) expect(r4.error.code).toBe("FORBIDDEN");

    const r5 = await inviteTeacherAccountTool(ctx, { teacherId: "t7" });
    expect(r5.ok).toBe(false);
    if (!r5.ok) expect(r5.error.code).toBe("FORBIDDEN");
  });
});

describe("11. Aynı e-posta — hesap çakışması net biçimde uyarılır, hesap eşlemesi BOZULMAZ", () => {
  it("öğrenci daveti: e-posta ZATEN bir öğretmen hesabına bağlıysa engellenir — öğretmenin hesabı ETKİLENMEZ", async () => {
    const res = await inviteStudentPortalAccessTool(adminCtx(), {
      studentId: "s1",
      email: "turgay.hosbas@niluferacar.com.tr", // t1'in gerçek hesap e-postası
      accessType: "GUARDIAN",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");

    // t1'in kendi girişi hâlâ çalışıyor mu — hesap eşlemesi bozulmadı.
    const stillWorks = await authenticateUser("turgay.hosbas@niluferacar.com.tr", "demo-teacher-csv-1");
    expect(stillWorks).not.toBeNull();
    expect(stillWorks?.role).toBe("TEACHER");

    // Hiçbir StudentPortalAccess kaydı OLUŞMADI.
    const summary = await getStudentPortalAccessTool(adminCtx(), { studentId: "s1" });
    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.data.accounts.some((a) => a.email === "turgay.hosbas@niluferacar.com.tr")).toBe(false);
    }
  });

  it("öğretmen daveti: e-posta ZATEN BAŞKA bir öğretmenin hesabına bağlıysa engellenir", async () => {
    const { readData } = await import("../store");
    const originalT7Email = (await readData()).teachers.find((t) => t.id === "t7")?.email ?? "";
    try {
      await updateTeacherProfile("t7", { email: "olcay.ozdemir@niluferacar.com.tr" }); // t2'nin gerçek e-postası
      const res = await inviteTeacherAccountTool(adminCtx(), { teacherId: "t7" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");

      // t2'nin kendi girişi hâlâ çalışıyor mu.
      const t2StillWorks = await authenticateUser("olcay.ozdemir@niluferacar.com.tr", "demo-teacher-csv-2");
      expect(t2StillWorks).not.toBeNull();
      expect(t2StillWorks?.teacherId).toBe("t2");
    } finally {
      await updateTeacherProfile("t7", { email: originalT7Email });
    }
  });

  it("BİLİNÇLİ İZİN VERİLEN durum: aynı velinin e-postası İKİNCİ bir çocuğa (farklı öğrenciye) GUARDIAN erişimi için kullanılabilir", async () => {
    const res = await inviteStudentPortalAccessTool(adminCtx(), {
      studentId: "s2", // s1'den FARKLI bir öğrenci
      email: "selin@email.com", // zaten s1 için kullanılan bootstrap veli e-postası
      accessType: "GUARDIAN",
    });
    expect(res.ok).toBe(true); // AYNI rol (STUDENT) paylaşımı serbest — bu bir hata DEĞİL
  });
});

describe("Kök neden düzeltmesi (2026-08-31, CEO bildirdi) — User kaydı olmayan MEVCUT öğrenci/öğretmen için portal daveti", () => {
  // `s_r3_1`/`tch_7epmkwtkfvi8` bu depodaki GERÇEK Student/Teacher iş
  // kayıtları ama BOOTSTRAP (HASHED) dizisinde YOK — yani tam olarak CEO'nun
  // bildirdiği hatayı üreten koşul: iş kaydı var, User kaydı hiç yok.
  const REAL_STUDENT_ID = "s_r3_1";
  const REAL_TEACHER_ID = "tch_7epmkwtkfvi8";
  const FRESH_GUARDIAN_EMAIL = "veli.testi.r3@ornek.test";

  it("1. User kaydı olmayan mevcut öğrenci: 'erişimi aç ve davet gönder' → User OLUŞUR + StudentPortalAccess 'invited' olur (KÖK NEDEN — önceden INTERNAL_ERROR veriyordu)", async () => {
    const before = await findDynamicUserByEmail(DEFAULT_TENANT_ID, FRESH_GUARDIAN_EMAIL);
    expect(before).toBeNull(); // ön koşul: bu e-posta için gerçekten hiçbir User yok

    setEmailTransportForTests({ name: "mock", async send() { return { delivered: true }; } });

    const res = await inviteStudentPortalAccessTool(adminCtx(), {
      studentId: REAL_STUDENT_ID,
      email: FRESH_GUARDIAN_EMAIL,
      accessType: "GUARDIAN",
    });
    expect(res.ok).toBe(true); // ARTIK "Kullanıcı hesabı oluşturulamadı/bulunamadı" DÖNMEZ
    if (res.ok) expect(res.data.delivered).toBe(true);

    const created = await findDynamicUserByEmail(DEFAULT_TENANT_ID, FRESH_GUARDIAN_EMAIL);
    expect(created).not.toBeNull();
    expect(created?.role).toBe("STUDENT");
    expect(created?.active).toBe(true);

    const summary = await getStudentPortalAccessTool(adminCtx(), { studentId: REAL_STUDENT_ID });
    expect(summary.ok).toBe(true);
    if (summary.ok && created) {
      const row = summary.data.accounts.find((a) => a.userId === created.userId);
      expect(row?.status).toBe("invited");
      expect(row?.email).toBe(FRESH_GUARDIAN_EMAIL);
    }

    // Aynı kullanıcı, giriş bilgisiyle DEĞİL ama davet altyapısıyla gerçekten var —
    // ham şifre asla admin'e/loglara sızmadı (createDynamicUser rastgele üretir, döndürülmez).
  });

  it("2. User kaydı olmayan mevcut öğretmen: 'erişimi aç ve davet gönder' → doğru rolde (TEACHER) User OLUŞUR", async () => {
    const { readData } = await import("../store");
    const teacherEmail = (await readData()).teachers.find((t) => t.id === REAL_TEACHER_ID)?.email ?? "";
    expect(teacherEmail).not.toBe(""); // ön koşul: öğretmenin kendi kaydında e-posta var

    const before = await findDynamicUserByTeacherId(DEFAULT_TENANT_ID, REAL_TEACHER_ID);
    expect(before).toBeNull(); // ön koşul: hiç User bağlı değil

    setEmailTransportForTests({ name: "mock", async send() { return { delivered: true }; } });

    const res = await inviteTeacherAccountTool(adminCtx(), { teacherId: REAL_TEACHER_ID });
    expect(res.ok).toBe(true); // ARTIK "Kullanıcı hesabı oluşturulamadı/bulunamadı" DÖNMEZ
    if (res.ok) expect(res.data.delivered).toBe(true);

    const created = await findDynamicUserByTeacherId(DEFAULT_TENANT_ID, REAL_TEACHER_ID);
    expect(created).not.toBeNull();
    expect(created?.role).toBe("TEACHER");
    expect(created?.email).toBe(teacherEmail.toLowerCase());

    const status = await getTeacherAccountStatusTool(adminCtx(), { teacherId: REAL_TEACHER_ID });
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.data.exists).toBe(true);
      expect(status.data.active).toBe(true);
    }

    // Giriş de gerçekten çalışıyor mu (uçtan uca) — davet kabul edilmeden önce şifre
    // rastgele/bilinmez olduğu için burada yalnızca hesabın VAR OLDUĞUNU ve rolünün
    // DOĞRU olduğunu doğruluyoruz; şifre belirleme akışı account-invitation.test.ts'de.
  });

  it("3. StudentPortalAccess kaydı var ama User kaydı yok (bozuk ilişki): servis 'kullanıcı bulunamadı' ile ÇÖKMEZ; yeniden davet güvenle onarır", async () => {
    const ORPHAN_USER_ID = "orphan-no-user-row"; // hiçbir HASHED/dynamic User'a karşılık gelmiyor
    await grantStudentAccess({ userId: ORPHAN_USER_ID, tenantId: DEFAULT_TENANT_ID }, REAL_STUDENT_ID, "GUARDIAN");

    // Çökmeden okunabiliyor mu — email boş döner, "kullanıcı bulunamadı" hatası YOK.
    const before = await getStudentPortalAccessTool(adminCtx(), { studentId: REAL_STUDENT_ID });
    expect(before.ok).toBe(true);
    if (before.ok) {
      const orphanRow = before.data.accounts.find((a) => a.userId === ORPHAN_USER_ID);
      expect(orphanRow?.email).toBe("");
      expect(orphanRow?.status).toBe("active"); // grantStudentAccess helper'ı doğrudan aktive eder
    }

    // Şifre sıfırlama/davet bu bozuk kayıt üzerinden İSTENİRSE net bir doğrulama
    // hatası döner (asla "user not found" ile çökmez).
    const resetOnOrphan = await sendStudentPortalPasswordResetTool(adminCtx(), { studentId: REAL_STUDENT_ID, userId: ORPHAN_USER_ID });
    expect(resetOnOrphan.ok).toBe(false);
    if (!resetOnOrphan.ok) expect(resetOnOrphan.error.code).toBe("VALIDATION_ERROR");

    // Şimdi admin GERÇEK bir e-postayla yeniden davet gönderiyor — onarım devreye
    // girer: eski bozuk kayıt additive biçimde "revoked" işaretlenir (silinmez),
    // yeni GEÇERLİ bir User + StudentPortalAccess satırı oluşur.
    setEmailTransportForTests({ name: "mock", async send() { return { delivered: true }; } });
    const reinvite = await inviteStudentPortalAccessTool(adminCtx(), {
      studentId: REAL_STUDENT_ID,
      email: "onarim.sonrasi@ornek.test",
      accessType: "GUARDIAN",
    });
    expect(reinvite.ok).toBe(true);

    const after = await getStudentPortalAccessTool(adminCtx(), { studentId: REAL_STUDENT_ID });
    expect(after.ok).toBe(true);
    if (after.ok) {
      const orphanRowAfter = after.data.accounts.find((a) => a.userId === ORPHAN_USER_ID);
      expect(orphanRowAfter?.status).toBe("revoked"); // onarıldı — veri SİLİNMEDİ, yalnızca kapatıldı
      const newRow = after.data.accounts.find((a) => a.email === "onarim.sonrasi@ornek.test");
      expect(newRow?.status).toBe("invited");
    }
  });
});
