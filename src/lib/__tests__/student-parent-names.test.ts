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
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("Öğrenci kaydında anne adı / baba adı (Paket 7)", () => {
  it("kayıt sırasında motherName/fatherName girilip saklanabilir", async () => {
    const data = await readData();
    const teacher = data.teachers.find((t) => t.instruments.includes("Piyano") && t.active)!;
    const res = await createStudentTool(ctx(), {
      name: "Test Öğrenci",
      email: "test@test.com",
      phone: "05551112233",
      parentName: "Veli Adı",
      parentPhone: "05559998877",
      motherName: "Ayşe Yılmaz",
      fatherName: "Mehmet Yılmaz",
      branchId: teacher.branchId,
      instrument: "Piyano",
      teacherId: teacher.id,
      packageName: "Bireysel Aylık",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const after = await readData();
    const student = after.students.find((s) => s.id === res.data.studentId)!;
    expect(student.motherName).toBe("Ayşe Yılmaz");
    expect(student.fatherName).toBe("Mehmet Yılmaz");
  });

  it("alan boş bırakılırsa opsiyonel kalır (legacy kayıt kırılmaz)", async () => {
    const data = await readData();
    const teacher = data.teachers.find((t) => t.instruments.includes("Piyano") && t.active)!;
    const res = await createStudentTool(ctx(), {
      name: "Test Öğrenci 2",
      email: "test2@test.com",
      phone: "05551112234",
      parentName: "Veli Adı",
      parentPhone: "05559998878",
      branchId: teacher.branchId,
      instrument: "Piyano",
      teacherId: teacher.id,
      packageName: "Bireysel Aylık",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const after = await readData();
    const student = after.students.find((s) => s.id === res.data.studentId)!;
    expect(student.motherName).toBeUndefined();
    expect(student.fatherName).toBeUndefined();
  });

  it("mevcut bir öğrencinin eksik anne/baba adı sonradan eklenebilir", async () => {
    const data = await readData();
    const existing = data.students[0]!;
    const res = await updateStudentProfileTool(ctx(), {
      studentId: existing.id,
      motherName: "Sonradan Eklenen Anne",
      fatherName: "Sonradan Eklenen Baba",
    });
    expect(res.ok).toBe(true);

    const after = await readData();
    const updated = after.students.find((s) => s.id === existing.id)!;
    expect(updated.motherName).toBe("Sonradan Eklenen Anne");
    expect(updated.fatherName).toBe("Sonradan Eklenen Baba");
  });
});
