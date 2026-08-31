import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createBranchTool, updateBranchTool, createTeacherTool, createRoomTool, createStudentTool } from "../services/tools";
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

describe("createBranchTool / updateBranchTool", () => {
  it("demo Erzene/Evka 3 şubeleri değişmeden çalışmaya devam eder", async () => {
    const data = await readData();
    const ids = data.settings.branches.map((b) => b.id).sort();
    expect(ids).toEqual(["erzene", "evka3"]);
  });

  it("üçüncü bir şube eklenir ve öğretmen/öğrenci/oda formlarında kullanılabilir", async () => {
    const created = await createBranchTool(ctx(), {
      name: "Bostanlı Şubesi",
      shortName: "Bostanlı",
      city: "İzmir",
      phone: "0555 000 0000",
      address: "Bostanlı Mah. No:1",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const newBranchId = created.data.branchId;

    const teacherRes = await createTeacherTool(ctx(), {
      name: "Yeni Öğretmen",
      email: "yeni@ogretmen.com",
      phone: "0555 111 1111",
      branchId: newBranchId,
      instrument: "Piyano",
    });
    expect(teacherRes.ok).toBe(true);

    const roomRes = await createRoomTool(ctx(), {
      name: "Bostanlı Stüdyo 1",
      branchId: newBranchId,
      capacity: 2,
      instruments: ["Piyano"],
    });
    expect(roomRes.ok).toBe(true);
    if (!teacherRes.ok) return;

    const studentRes = await createStudentTool(ctx(), {
      name: "Yeni Öğrenci",
      email: "yeni@ogrenci.com",
      phone: "0555 222 2222",
      parentName: "Veli Adı",
      parentPhone: "0555 333 3333",
      branchId: newBranchId,
      instrument: "Piyano",
      teacherId: teacherRes.data.teacherId,
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" },
      notes: "",
    });
    expect(studentRes.ok).toBe(true);

    const data = await readData();
    expect(data.settings.branches.some((b) => b.id === newBranchId)).toBe(true);
    expect(data.teachers.some((t) => t.branchId === newBranchId)).toBe(true);
    expect(data.rooms.some((r) => r.branchId === newBranchId)).toBe(true);
    expect(data.students.some((s) => s.branchId === newBranchId)).toBe(true);
  });

  it("var olmayan şubeye öğretmen eklenemez (şube bulunamadı)", async () => {
    const res = await createTeacherTool(ctx(), {
      name: "X",
      email: "x@x.com",
      phone: "0555 000 0000",
      branchId: "does-not-exist",
      instrument: "Piyano",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INTERNAL_ERROR");
  });

  it("şube düzenlenebilir; silme yolu yoktur", async () => {
    const data = await readData();
    const erzene = data.settings.branches.find((b) => b.id === "erzene")!;
    const res = await updateBranchTool(ctx(), { branchId: erzene.id, phone: "0555 999 9999" });
    expect(res.ok).toBe(true);

    const after = await readData();
    expect(after.settings.branches.find((b) => b.id === "erzene")?.phone).toBe("0555 999 9999");
    expect(after.settings.branches.length).toBe(data.settings.branches.length);
  });

  it("veli/öğretmen rolü şube ekleyemez veya düzenleyemez (FORBIDDEN)", async () => {
    const addRes = await createBranchTool(ctx({ role: "TEACHER" }), {
      name: "X",
      shortName: "X",
      city: "X",
      phone: "0",
      address: "X",
    });
    expect(addRes.ok).toBe(false);
    if (!addRes.ok) expect(addRes.error.code).toBe("FORBIDDEN");

    const updateRes = await updateBranchTool(ctx({ role: "STUDENT" }), {
      branchId: "erzene",
      phone: "0",
    });
    expect(updateRes.ok).toBe(false);
    if (!updateRes.ok) expect(updateRes.error.code).toBe("FORBIDDEN");
  });
});
