import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { updateStudentProfileTool, createStudentTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { effectiveStudentTypes, formatStudentTypes } from "../student-types";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("effectiveStudentTypes / formatStudentTypes", () => {
  it("studentTypes doluysa aynen döner", () => {
    expect(effectiveStudentTypes({ studentTypes: ["MEB", "Hobi"] })).toEqual(["MEB", "Hobi"]);
  });
  it("studentTypes yoksa legacy studentType'tan tek-elemanlı dizi türetir", () => {
    expect(effectiveStudentTypes({ studentType: "MEB" })).toEqual(["MEB"]);
    expect(effectiveStudentTypes({})).toEqual([]);
  });
  it("formatStudentTypes boşsa 'Belirtilmemiş' döner, doluysa virgülle ayırır", () => {
    expect(formatStudentTypes([])).toBe("Belirtilmemiş");
    expect(formatStudentTypes(["MEB", "Hobi"])).toBe("MEB, Hobi");
  });
});

describe("updateStudentProfileTool · Faz 1B entegrasyonu", () => {
  it("studentTypes verilince legacy studentType ilk türle senkron olur", async () => {
    const res = await updateStudentProfileTool(ctx(), {
      studentId: "s1",
      studentTypes: ["MEB", "London College of Music Hazırlık"],
    });
    expect(res.ok).toBe(true);

    const data = await readData();
    const student = data.students.find((s) => s.id === "s1");
    expect(student?.studentTypes).toEqual(["MEB", "London College of Music Hazırlık"]);
    expect(student?.studentType).toBe("MEB");
  });

  it("boş dizi gönderilirse tüm türler ve legacy tür temizlenir", async () => {
    await updateStudentProfileTool(ctx(), { studentId: "s1", studentTypes: ["Hobi"] });
    const res = await updateStudentProfileTool(ctx(), { studentId: "s1", studentTypes: [] });
    expect(res.ok).toBe(true);

    const data = await readData();
    const student = data.students.find((s) => s.id === "s1");
    expect(student?.studentTypes).toEqual([]);
    expect(student?.studentType).toBeUndefined();
  });

  it("studentTypes verilmeyen bir güncellemede mevcut türler dokunulmadan kalır", async () => {
    await updateStudentProfileTool(ctx(), { studentId: "s1", studentTypes: ["MEB"] });
    const res = await updateStudentProfileTool(ctx(), { studentId: "s1", phone: "0 555 000 00 00" });
    expect(res.ok).toBe(true);

    const data = await readData();
    const student = data.students.find((s) => s.id === "s1");
    expect(student?.studentTypes).toEqual(["MEB"]);
    expect(student?.studentType).toBe("MEB");
  });
});

describe("createStudentTool · Faz 1B — tekil studentType tek-elemanlı diziye türetilir", () => {
  it("yeni öğrenci tekil studentType ile oluşturulunca studentTypes de doldurulur", async () => {
    const before = await readData();
    const teacher = before.teachers.find((t) => t.active && t.instruments.includes("Piyano"));
    expect(teacher).toBeDefined();

    const res = await createStudentTool(ctx(), {
      name: "Faz 1B Test Öğrencisi",
      email: "",
      phone: "05551234567",
      parentName: "Veli",
      parentPhone: "05551234567",
      branchId: teacher!.branchId,
      instrument: "Piyano",
      teacherId: teacher!.id,
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" },
      enrollmentStartDate: "2026-09-01",
      notes: "",
      studentType: "MEB",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const data = await readData();
    const created = data.students.find((s) => s.id === res.data.studentId);
    expect(created?.studentTypes).toEqual(["MEB"]);
  });
});
