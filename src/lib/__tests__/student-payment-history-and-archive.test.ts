import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { archiveStudentTool, createStudentTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { filterPaymentHistory } from "../payment-profile";
import { currentAcademicAnchorYear } from "../attendance-calendar";
import type { Payment } from "../types";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  vi.clearAllMocks();
});

function payment(overrides: Partial<Payment>): Payment {
  return {
    id: "p_test",
    studentId: "s1",
    description: "Test",
    amount: 1000,
    paidAmount: 0,
    status: "pending",
    dueDate: "2026-01-01",
    ...overrides,
  } as Payment;
}

describe("filterPaymentHistory — öğrenci ödeme geçmişi görünümü", () => {
  it("bekliyor ve gecikmiş kayıtları gizler, gerçekleşmiş hareketleri korur", () => {
    const payments = [
      payment({ id: "p1", status: "pending" }),
      payment({ id: "p2", status: "overdue" }),
      payment({ id: "p3", status: "paid" }),
      payment({ id: "p4", status: "partial" }),
      payment({ id: "p5", status: "voided" }),
    ];
    const history = filterPaymentHistory(payments);
    expect(history.map((p) => p.id).sort()).toEqual(["p3", "p4", "p5"]);
  });

  it("boş liste için boş liste döner", () => {
    expect(filterPaymentHistory([])).toEqual([]);
  });
});

describe("archiveStudentTool — öğrenci arşivleme/geri alma", () => {
  const baseStudentInput = {
    name: "Arşiv Test Öğrenci",
    email: "",
    phone: "5551234567",
    parentName: "Veli Adı",
    parentPhone: "5559876543",
    branchId: "erzene",
    instrument: "Piyano",
    teacherId: "t1",
    packageName: "Bireysel Aylık — 4 ders",
    weeklyLessonCount: 1,
    monthlyFee: 3000,
    firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" },
    enrollmentStartDate: "2026-09-01",
  };

  it("arşivlenen öğrenci active=false ve archivedAt dolu olur; normal listeden düşer", async () => {
    const created = await createStudentTool(ctx(), baseStudentInput);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const res = await archiveStudentTool(ctx(), { studentId: created.data.studentId, archived: true });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.archived).toBe(true);

    const data = await readData();
    const student = data.students.find((s) => s.id === created.data.studentId);
    expect(student?.active).toBe(false);
    expect(student?.archivedAt).toBeTruthy();

    const activeOnly = data.students.filter((s) => s.active);
    expect(activeOnly.some((s) => s.id === created.data.studentId)).toBe(false);
  });

  it("geri alma mevcut yetki modeliyle (SCHOOL_ADMIN/SUPER_ADMIN) çalışır ve active=true'ya döner", async () => {
    const created = await createStudentTool(ctx(), baseStudentInput);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await archiveStudentTool(ctx(), { studentId: created.data.studentId, archived: true });
    const restore = await archiveStudentTool(ctx(), { studentId: created.data.studentId, archived: false });
    expect(restore.ok).toBe(true);

    const data = await readData();
    const student = data.students.find((s) => s.id === created.data.studentId);
    expect(student?.active).toBe(true);
  });

  it("yetkisiz rol (TEACHER) arşivleyemez", async () => {
    const created = await createStudentTool(ctx(), baseStudentInput);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const res = await archiveStudentTool(ctx({ role: "TEACHER" }), {
      studentId: created.data.studentId,
      archived: true,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("Yoklama takvimi — dönem varsayılanı", () => {
  it("currentAcademicAnchorYear her iki dönem tipi için de bir sayı döner (öğrencinin termType'ına göre panel varsayılanı bu değeri kullanır)", () => {
    expect(typeof currentAcademicAnchorYear("guz")).toBe("number");
    expect(typeof currentAcademicAnchorYear("yaz")).toBe("number");
  });
});
