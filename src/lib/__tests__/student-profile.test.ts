import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createStudentTool, updateStudentProfileTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("createStudentTool — EPIC 4 profil alanları", () => {
  it("studentType/enrollmentStartDate/level/targetExam opsiyonel alanları kaydeder", async () => {
    const created = await createStudentTool(ctx(), {
      name: "Test Öğrenci",
      email: "",
      phone: "0555 000 0000",
      parentName: "Veli",
      parentPhone: "0555 000 0001",
      branchId: "erzene",
      instrument: "Piyano",
      teacherId: "t1",
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
      studentType: "Konservatuvar Hazırlık",
      enrollmentStartDate: "2026-01-15",
      level: "İleri",
      targetExam: "2027 Konservatuvar giriş sınavı",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const data = await readData();
    const student = data.students.find((s) => s.id === created.data.studentId);
    expect(student?.studentType).toBe("Konservatuvar Hazırlık");
    expect(student?.level).toBe("İleri");
    expect(student?.targetExam).toBe("2027 Konservatuvar giriş sınavı");
    expect(student?.enrollmentStartDate).toContain("2026-01-15");
  });

  it("profil alanları verilmezse undefined kalır — hata vermez, 'Belirtilmemiş' varsayımı UI katmanında yapılır", async () => {
    const created = await createStudentTool(ctx(), {
      name: "Profilsiz Öğrenci",
      email: "",
      phone: "0555 000 0002",
      parentName: "Veli",
      parentPhone: "0555 000 0003",
      branchId: "erzene",
      instrument: "Gitar",
      teacherId: "t2",
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const data = await readData();
    const student = data.students.find((s) => s.id === created.data.studentId);
    expect(student?.studentType).toBeUndefined();
    expect(student?.level).toBeUndefined();
  });
});

describe("updateStudentProfileTool — yetkilendirme ve kısmi güncelleme", () => {
  it("SCHOOL_ADMIN yalnızca gönderilen alanları günceller, diğer öğrenci alanlarına dokunmaz", async () => {
    const before = await readData();
    const target = before.students[0];

    const result = await updateStudentProfileTool(ctx(), {
      studentId: target.id,
      studentType: "Hobi",
      level: "Başlangıç",
    });
    expect(result.ok).toBe(true);

    const after = await readData();
    const updated = after.students.find((s) => s.id === target.id);
    expect(updated?.studentType).toBe("Hobi");
    expect(updated?.level).toBe("Başlangıç");
    // Değiştirilmemiş alanlar aynı kalır
    expect(updated?.name).toBe(target.name);
    expect(updated?.monthlyFee).toBe(target.monthlyFee);
    expect(updated?.packageName).toBe(target.packageName);
  });

  it("TEACHER rolü öğrenci profilini güncelleyemez (FORBIDDEN)", async () => {
    const before = await readData();
    const target = before.students[0];

    const result = await updateStudentProfileTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      studentId: target.id,
      studentType: "Hobi",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("PARENT rolü öğrenci profilini güncelleyemez (FORBIDDEN)", async () => {
    const before = await readData();
    const target = before.students[0];

    const result = await updateStudentProfileTool(ctx({ role: "STUDENT", studentId: target.id }), {
      studentId: target.id,
      studentType: "Hobi",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("var olmayan öğrenci için hata döner", async () => {
    const result = await updateStudentProfileTool(ctx(), {
      studentId: "does-not-exist",
      studentType: "Hobi",
    });
    expect(result.ok).toBe(false);
  });
});

describe("updateStudentProfileTool — iletişim/kişisel alanlar (bu sprint)", () => {
  it("SCHOOL_ADMIN telefon/veli/adres/doğum/okul-meslek alanlarını günceller", async () => {
    const before = await readData();
    const target = before.students[0];

    const result = await updateStudentProfileTool(ctx(), {
      studentId: target.id,
      phone: "0555 111 2233",
      parentName: "Yeni Veli Adı",
      parentPhone: "0555 111 2244",
      address: "Yeni adres",
      birthDate: "2012-05-01",
      birthPlace: "Ankara",
      schoolOrOccupation: "Filiz İlkokulu 4-B",
      communicationOptOut: true,
    });
    expect(result.ok).toBe(true);

    const after = await readData();
    const updated = after.students.find((s) => s.id === target.id);
    expect(updated?.phone).toBe("0555 111 2233");
    expect(updated?.parentName).toBe("Yeni Veli Adı");
    expect(updated?.parentPhone).toBe("0555 111 2244");
    expect(updated?.address).toBe("Yeni adres");
    expect(updated?.birthDate).toContain("2012-05-01");
    expect(updated?.birthPlace).toBe("Ankara");
    expect(updated?.schoolOrOccupation).toBe("Filiz İlkokulu 4-B");
    expect(updated?.communicationOptOut).toBe(true);
  });

  it("T.C. kimlik bu tooldan asla güncellenemez — şema alanı yok, gönderilse bile yok sayılır", async () => {
    const before = await readData();
    const target = before.students[0];

    const result = await updateStudentProfileTool(ctx(), {
      studentId: target.id,
      phone: "0555 999 8877",
      nationalIdCipher: "should-be-ignored",
    });
    expect(result.ok).toBe(true);

    const after = await readData();
    const updated = after.students.find((s) => s.id === target.id);
    expect(updated?.nationalIdCipher).toBe(target.nationalIdCipher);
  });

  it("TEACHER/PARENT iletişim alanlarını güncelleyemez (RBAC)", async () => {
    const before = await readData();
    const target = before.students[0];

    const teacherRes = await updateStudentProfileTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      studentId: target.id,
      phone: "0555 000 0000",
    });
    expect(teacherRes.ok).toBe(false);

    const parentRes = await updateStudentProfileTool(ctx({ role: "STUDENT", studentId: target.id }), {
      studentId: target.id,
      phone: "0555 000 0000",
    });
    expect(parentRes.ok).toBe(false);
  });
});
