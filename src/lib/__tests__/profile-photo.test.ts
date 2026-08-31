/**
 * Profil fotoğrafı (öğrenci/öğretmen/kullanıcı) uçtan uca testleri —
 * yönetme (yükle/sil) yalnızca sahibinin kendisi/admin, görüntüleme daha
 * geniş (öğretmen kendi öğrencisi, veli kendi çocuğu, admin herkes) — bkz.
 * src/lib/services/tools.ts canManagePhoto/resolvePhotoOwnerRecord.
 *
 * Karma Öğrenci Portalı — eski PARENT rolü YOK; veli/öğrenci ayrımı
 * StudentPortalAccess.accessType ("GUARDIAN" | "SELF") ile çözülür (bkz.
 * src/lib/student-portal-access.ts). Bir veli KENDİ "user" fotoğrafını
 * yönetebilir ama çocuğunun "student" fotoğrafını YÖNETEMEZ (yalnızca
 * görüntüler) — bu, mobil hesap menüsünden çocuk fotoğrafının sessizce
 * değiştirilmesini engelleyen güvenlik sınırıdır.
 *
 * Seed: s1.teacherId === t1 (bkz. seed.ts / diğer StudentPortalAccess testleri).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { uploadProfilePhotoTool, deleteProfilePhotoTool, getProfilePhotoTool } from "../services/tools";
import { PROFILE_PHOTOS_FILE, upsertProfilePhoto, getProfilePhoto } from "../profile-photos";
import { STUDENT_PORTAL_ACCESS_FILE, grantActiveStudentPortalAccess } from "../student-portal-access";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

beforeEach(async () => {
  await fs.rm(PROFILE_PHOTOS_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

describe("uploadProfilePhotoTool / deleteProfilePhotoTool — yönetme yetkisi", () => {
  it("STUDENT (SELF) kendi fotoğrafını yükleyebilir ve silebilir", async () => {
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "u-s1",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin",
    });
    const studentCtx = ctx({ role: "STUDENT", userId: "u-s1" });
    const up = await uploadProfilePhotoTool(studentCtx, {
      ownerType: "student",
      ownerId: "s1",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    expect(up.ok).toBe(true);

    const view = await getProfilePhotoTool(studentCtx, { ownerType: "student", ownerId: "s1" });
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.data).not.toBeNull();

    const del = await deleteProfilePhotoTool(studentCtx, { ownerType: "student", ownerId: "s1" });
    expect(del.ok).toBe(true);

    const afterDelete = await getProfilePhotoTool(studentCtx, { ownerType: "student", ownerId: "s1" });
    expect(afterDelete.ok).toBe(true);
    if (!afterDelete.ok) return;
    expect(afterDelete.data).toBeNull(); // silme = baş harf fallback'ine dönüş
  });

  it("STUDENT (SELF) başka bir öğrencinin fotoğrafını yükleyemez (FORBIDDEN)", async () => {
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "u-s1",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin",
    });
    const studentCtx = ctx({ role: "STUDENT", userId: "u-s1" });
    const res = await uploadProfilePhotoTool(studentCtx, {
      ownerType: "student",
      ownerId: "s2",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("GUARDIAN (veli) çocuğunun 'student' fotoğrafını YÖNETEMEZ — yalnızca görüntüler (P0 güvenlik kuralı)", async () => {
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "u-guardian1",
      studentId: "s1",
      accessType: "GUARDIAN",
      invitedBy: "admin",
    });
    const guardianCtx = ctx({ role: "STUDENT", userId: "u-guardian1" });

    const upload = await uploadProfilePhotoTool(guardianCtx, {
      ownerType: "student",
      ownerId: "s1",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    expect(upload.ok).toBe(false);
    if (upload.ok) return;
    expect(upload.error.code).toBe("FORBIDDEN");

    // Ama görüntüleyebilir — assertStudentAccess GUARDIAN'ı da kabul eder.
    await uploadProfilePhotoTool(ctx(), { ownerType: "student", ownerId: "s1", fileMimeType: "image/png", fileData: TINY_PNG_BASE64 });
    const view = await getProfilePhotoTool(guardianCtx, { ownerType: "student", ownerId: "s1" });
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.data).not.toBeNull();
  });

  it("GUARDIAN (veli) KENDİ 'user' hesap fotoğrafını yükleyip art arda değiştirebilir (P0-3 regresyon)", async () => {
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "u-guardian1",
      studentId: "s1",
      accessType: "GUARDIAN",
      invitedBy: "admin",
    });
    const guardianCtx = ctx({ role: "STUDENT", userId: "u-guardian1" });

    const first = await uploadProfilePhotoTool(guardianCtx, {
      ownerType: "user",
      ownerId: "u-guardian1",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    expect(first.ok).toBe(true);

    // İkinci (değiştirme) yüklemesi de aynı şekilde başarılı olmalı — P0-1 regresyon testi.
    const second = await uploadProfilePhotoTool(guardianCtx, {
      ownerType: "user",
      ownerId: "u-guardian1",
      fileMimeType: "image/webp",
      fileData: TINY_PNG_BASE64,
    });
    expect(second.ok).toBe(true);

    const view = await getProfilePhotoTool(guardianCtx, { ownerType: "user", ownerId: "u-guardian1" });
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.data?.fileMimeType).toBe("image/webp");

    const del = await deleteProfilePhotoTool(guardianCtx, { ownerType: "user", ownerId: "u-guardian1" });
    expect(del.ok).toBe(true);
  });

  it("bir kullanıcı başka bir kullanıcının 'user' fotoğrafını yönetemez (FORBIDDEN)", async () => {
    const guardianCtx = ctx({ role: "STUDENT", userId: "u-guardian1" });
    const res = await uploadProfilePhotoTool(guardianCtx, {
      ownerType: "user",
      ownerId: "u-guardian2",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("TEACHER kendi fotoğrafını yükleyebilir ama kendi öğrencisinin fotoğrafını YÖNETEMEZ", async () => {
    const teacherCtx = ctx({ role: "TEACHER", userId: "u-t1", teacherId: "t1" });
    const ownPhoto = await uploadProfilePhotoTool(teacherCtx, {
      ownerType: "teacher",
      ownerId: "t1",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    expect(ownPhoto.ok).toBe(true);

    // s1.teacherId === t1 — erişebildiği bir öğrenci, ama YÖNETME izni yok (yalnızca görüntüleme).
    const studentPhoto = await uploadProfilePhotoTool(teacherCtx, {
      ownerType: "student",
      ownerId: "s1",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    expect(studentPhoto.ok).toBe(false);
    if (studentPhoto.ok) return;
    expect(studentPhoto.error.code).toBe("FORBIDDEN");
  });

  it("TEACHER erişemediği bir öğretmenin fotoğrafını yükleyemez", async () => {
    const teacherCtx = ctx({ role: "TEACHER", userId: "u-t1", teacherId: "t1" });
    const res = await uploadProfilePhotoTool(teacherCtx, {
      ownerType: "teacher",
      ownerId: "t2",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN herhangi bir öğrenci/öğretmenin fotoğrafını yönetebilir", async () => {
    const adminCtx = ctx();
    const forStudent = await uploadProfilePhotoTool(adminCtx, {
      ownerType: "student",
      ownerId: "s1",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    expect(forStudent.ok).toBe(true);
    const forTeacher = await uploadProfilePhotoTool(adminCtx, {
      ownerType: "teacher",
      ownerId: "t1",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    expect(forTeacher.ok).toBe(true);
  });

  it("desteklenmeyen dosya türü reddedilir (VALIDATION_ERROR)", async () => {
    const adminCtx = ctx();
    const res = await uploadProfilePhotoTool(adminCtx, {
      ownerType: "student",
      ownerId: "s1",
      fileMimeType: "application/pdf",
      fileData: TINY_PNG_BASE64,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("bozuk/eksik gövde jenerik 'Invalid input' ile reddedilir ama VALIDATION_ERROR kodunu korur (malformed payload)", async () => {
    const adminCtx = ctx();
    const res = await uploadProfilePhotoTool(adminCtx, { ownerType: "student" /* ownerId, fileMimeType, fileData eksik */ });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("2 MB üzeri bir dosya jenerik 'Invalid input' DEĞİL, dostane boyut mesajıyla reddedilir (kök neden)", async () => {
    const adminCtx = ctx();
    // ~2.6 MB ham veri üreten base64 (zod'un geniş üst sınırının ALTINDA, domain limitinin ÜZERİNDE —
    // bu sıralama olmasaydı zod'un jenerik "Invalid input" hatası domain mesajının önüne geçerdi).
    const oversized = "A".repeat(3_500_000);
    const res = await uploadProfilePhotoTool(adminCtx, {
      ownerType: "student",
      ownerId: "s1",
      fileMimeType: "image/png",
      fileData: oversized,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).toContain("büyük");
    expect(res.error.message).not.toBe("Invalid input");
  });

  it("yeniden yükleme (değiştirme) eskisinin ÜZERİNE yazar, ayrı bir kayıt oluşturmaz — art arda 3 kez", async () => {
    const adminCtx = ctx();
    for (const mime of ["image/png", "image/webp", "image/jpeg"] as const) {
      const res = await uploadProfilePhotoTool(adminCtx, {
        ownerType: "student",
        ownerId: "s1",
        fileMimeType: mime,
        fileData: TINY_PNG_BASE64,
      });
      expect(res.ok).toBe(true);
    }

    const view = await getProfilePhotoTool(adminCtx, { ownerType: "student", ownerId: "s1" });
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.data?.fileMimeType).toBe("image/jpeg");

    // Depo katmanında da tek satır kalmalı — ayrı bir kayıt YOK.
    const stored = await getProfilePhoto(DEFAULT_TENANT_ID, "student", "s1");
    expect(stored).not.toBeNull();
  });
});

describe("getProfilePhotoTool — görüntüleme yetkisi (yönetmeden DAHA GENİŞ)", () => {
  beforeEach(async () => {
    await uploadProfilePhotoTool(ctx(), {
      ownerType: "student",
      ownerId: "s1",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
  });

  it("TEACHER kendi öğrencisinin fotoğrafını görüntüleyebilir (yönetemese bile)", async () => {
    const res = await getProfilePhotoTool(ctx({ role: "TEACHER", userId: "u-t1", teacherId: "t1" }), {
      ownerType: "student",
      ownerId: "s1",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).not.toBeNull();
  });

  it("TEACHER erişemediği bir öğrencinin fotoğrafını GÖREMEZ", async () => {
    const res = await getProfilePhotoTool(ctx({ role: "TEACHER", userId: "u-t2", teacherId: "t2" }), {
      ownerType: "student",
      ownerId: "s1", // s1.teacherId === t1, t2 DEĞİL
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("profil fotoğrafı deposu — tenant izolasyonu", () => {
  const OTHER_TENANT = "tenant_other_profile_photo_test";

  it("bir tenant'ta yüklenen fotoğraf başka bir tenant'tan GÖRÜNMEZ (aynı ownerId olsa bile)", async () => {
    await upsertProfilePhoto({
      tenantId: DEFAULT_TENANT_ID,
      ownerType: "student",
      ownerId: "s1",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
      fileSize: 100,
      uploadedBy: "u1",
    });

    const sameTenant = await getProfilePhoto(DEFAULT_TENANT_ID, "student", "s1");
    expect(sameTenant).not.toBeNull();

    const otherTenant = await getProfilePhoto(OTHER_TENANT, "student", "s1");
    expect(otherTenant).toBeNull();
  });

  it("bir tenant'ta silme başka bir tenant'ın aynı ownerId'li fotoğrafını ETKİLEMEZ", async () => {
    await upsertProfilePhoto({
      tenantId: DEFAULT_TENANT_ID,
      ownerType: "student",
      ownerId: "s1",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
      fileSize: 100,
      uploadedBy: "u1",
    });
    await upsertProfilePhoto({
      tenantId: OTHER_TENANT,
      ownerType: "student",
      ownerId: "s1",
      fileMimeType: "image/webp",
      fileData: TINY_PNG_BASE64,
      fileSize: 100,
      uploadedBy: "u2",
    });

    const { deleteProfilePhoto } = await import("../profile-photos");
    await deleteProfilePhoto(DEFAULT_TENANT_ID, "student", "s1");

    expect(await getProfilePhoto(DEFAULT_TENANT_ID, "student", "s1")).toBeNull();
    const stillThere = await getProfilePhoto(OTHER_TENANT, "student", "s1");
    expect(stillThere).not.toBeNull();
    expect(stillThere?.fileMimeType).toBe("image/webp");
  });
});
