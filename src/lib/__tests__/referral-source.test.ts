import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, promises as fs } from "fs";
import path from "path";
import { REFERRAL_SOURCES, REFERRAL_SOURCE_LABELS } from "../types";
import { studentSchema, updateStudentProfileSchema } from "../validation";
import { resolveDataDir } from "../config";
import { createStudentTool, updateStudentProfileTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("Bizi nereden buldunuz? — kanonik kaynak listesi", () => {
  it("istenen altı seçeneği içerir", () => {
    expect([...REFERRAL_SOURCES]).toEqual(["instagram", "google", "tavsiye", "referans", "afis_etkinlik", "diger"]);
  });

  it("etiketler ürün dilindedir", () => {
    expect(REFERRAL_SOURCE_LABELS).toEqual({
      instagram: "Instagram",
      google: "Google/İnternet araması",
      tavsiye: "Veli/öğrenci tavsiyesi",
      referans: "Referans",
      afis_etkinlik: "Afiş/etkinlik",
      diger: "Diğer",
    });
  });
});

describe("Bizi nereden buldunuz? — doğrulama (zorunlu değil)", () => {
  it("kayıt şeması alanı opsiyonel kabul eder", () => {
    const base = {
      name: "Test Öğrenci",
      parentName: "Test Veli",
      parentPhone: "05000000000",
      branchId: "b1",
      instrument: "Piyano",
      teacherId: "t1",
      packageName: "Paket",
      weeklyLessonCount: 1,
      monthlyFee: 1000,
      enrollmentStartDate: "2026-09-01",
    };
    expect(studentSchema.safeParse(base).success).toBe(true);
    const withSource = studentSchema.safeParse({ ...base, referralSource: "instagram" });
    expect(withSource.success).toBe(true);
    const withOther = studentSchema.safeParse({
      ...base,
      referralSource: "diger",
      referralSourceDetail: "Komşu önerdi",
    });
    expect(withOther.success).toBe(true);
  });

  it("bilinmeyen kaynak değeri reddedilir", () => {
    const base = {
      name: "Test Öğrenci",
      parentName: "Test Veli",
      parentPhone: "05000000000",
      branchId: "b1",
      instrument: "Piyano",
      teacherId: "t1",
      packageName: "Paket",
      weeklyLessonCount: 1,
      monthlyFee: 1000,
      enrollmentStartDate: "2026-09-01",
    };
    expect(studentSchema.safeParse({ ...base, referralSource: "billboard" }).success).toBe(false);
  });

  it("düzenleme şeması alanı kabul eder", () => {
    expect(updateStudentProfileSchema.safeParse({ studentId: "s1", referralSource: "tavsiye" }).success).toBe(true);
    expect(
      updateStudentProfileSchema.safeParse({ studentId: "s1", referralSource: "diger", referralSourceDetail: "x" })
        .success
    ).toBe(true);
  });
});

describe("Bizi nereden buldunuz? — kalıcılık (öğrenci kaydına bağlı)", () => {
  it("createStudentTool kaydeder, updateStudentProfileTool günceller", async () => {
    const created = await createStudentTool(ctx(), {
      name: "Kaynak Test Öğrenci",
      email: "",
      phone: "0555 000 0010",
      parentName: "Veli",
      parentPhone: "0555 000 0011",
      branchId: "erzene",
      instrument: "Piyano",
      teacherId: "t1",
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
      enrollmentStartDate: "2026-09-01",
      referralSource: "diger",
      referralSourceDetail: "Komşumuz önerdi",
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-09-01" },
      // Tutar otomatik öneriyle birebir eşleşirse yoksayılır, farklıysa
      // kabul edilir — bu testin konusu tutar değil, kaynağın kalıcılığı.
      firstPaymentAdjustmentReason: "Kalıcılık testi — gerekçe",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const data = await readData();
    const student = data.students.find((s) => s.id === created.data.studentId);
    expect(student?.referralSource).toBe("diger");
    expect(student?.referralSourceDetail).toBe("Komşumuz önerdi");

    const updated = await updateStudentProfileTool(ctx(), {
      studentId: created.data.studentId,
      referralSource: "instagram",
      referralSourceDetail: undefined,
    });
    expect(updated.ok).toBe(true);
    const after = await readData();
    const studentAfter = after.students.find((s) => s.id === created.data.studentId);
    expect(studentAfter?.referralSource).toBe("instagram");
  });

  it("kaynak verilmezse undefined kalır (legacy kayıtlar kırılmaz)", async () => {
    const created = await createStudentTool(ctx(), {
      name: "Kaynaksız Öğrenci",
      email: "",
      phone: "0555 000 0020",
      parentName: "Veli",
      parentPhone: "0555 000 0021",
      branchId: "erzene",
      instrument: "Gitar",
      teacherId: "t2",
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
      enrollmentStartDate: "2026-09-01",
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-09-01" },
      firstPaymentAdjustmentReason: "Kalıcılık testi — gerekçe",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const data = await readData();
    const student = data.students.find((s) => s.id === created.data.studentId);
    expect(student?.referralSource).toBeUndefined();
    expect(student?.referralSourceDetail).toBeUndefined();
  });
});

describe("Bizi nereden buldunuz? — form alanları mevcut", () => {
  it("kayıt formunda seçim + Diğer serbest metin alanı vardır", () => {
    const form = readFileSync(path.join(ROOT, "src/components/new-student-form.tsx"), "utf-8");
    expect(form).toContain('name="referralSource"');
    expect(form).toContain('name="referralSourceDetail"');
    expect(form).toContain("Bizi nereden buldunuz?");
    expect(form).toContain("REFERRAL_SOURCES");
  });

  it("düzenleme formunda alan vardır", () => {
    const editor = readFileSync(path.join(ROOT, "src/components/student-profile-editor.tsx"), "utf-8");
    expect(editor).toContain("referralSource");
    expect(editor).toContain("Bizi nereden buldunuz?");
  });

  it("detay ekranında görüntülenir", () => {
    // 2026-09-20 — öğrenci detayı sekmelere bölündü (J); "Bizi nereden
    // buldunuz?" alanı artık Özet değil, "Bilgiler" sekmesindedir.
    const detail = readFileSync(
      path.join(ROOT, "src/app/panel/ogrenciler/[studentId]/bilgiler/page.tsx"),
      "utf-8"
    );
    expect(detail).toContain("Bizi nereden buldunuz?");
    expect(detail).toContain("REFERRAL_SOURCE_LABELS");
  });
});
