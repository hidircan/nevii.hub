import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { AppRole } from "../auth/types";
import type { ServiceContext } from "../services/context";
import { grantStudentAccess } from "./portal-access-test-helper";

/**
 * Mobil P0 salt-okunur tool'ları — kapsam testleri. `readData` sabit bir
 * fixture döndürür (store'a yazım YOK); portal erişimi gerçek
 * student-portal-access modülünden (json test store'u).
 */
const fixture = vi.hoisted(() => ({ data: null as unknown }));
vi.mock("../store", async (orig) => {
  // DB egress (2026-10-17): tool'lar dar dilim okur — dilimler aynı fixture'dan json/memory ile AYNI kuralla türetilir.
  const { narrowToMakeupCenter, toReferenceData } = await import("../reference-data");
  const data = () => fixture.data as import("../types").AppData;
  return {
    ...(await orig<typeof import("../store")>()),
    readData: vi.fn(async () => fixture.data),
    readMakeupCenterData: vi.fn(async () => narrowToMakeupCenter(data())),
    readReferenceData: vi.fn(async () => toReferenceData(data())),
    readPaymentById: vi.fn(async (id: string) => data().payments.find((p) => p.id === id)),
  };
});

const { listMakeupRequestsTool, getPaymentReceiptTool } = await import("../services/mobile-read");

const slot = { startAt: "2026-09-20T10:00:00.000Z", endAt: "2026-09-20T10:40:00.000Z", teacherId: "t1", roomId: "r1", branchId: "erzene", score: 1, reasons: [] };
const makeup = (id: string, studentId: string, teacherId: string) => ({
  id,
  studentId,
  teacherId,
  branchId: "erzene",
  instrument: "Piyano",
  sourceLessonId: `l_${id}`,
  attendanceId: `a_${id}`,
  status: "pending",
  reason: "Devamsızlık",
  expiresAt: "2026-10-10T00:00:00.000Z",
  suggestedSlots: [slot],
  createdAt: "2026-09-10T00:00:00.000Z",
  policyNote: "30 gün",
  decidedBy: "user_internal",
  decisionNote: "iç not",
});

fixture.data = {
  students: [
    { id: "s1", name: "Öğrenci Bir", teacherId: "t1", branchId: "erzene", parentName: "Veli Bir", parentPhone: "5550000000" },
    { id: "s2", name: "Öğrenci İki", teacherId: "t2", branchId: "erzene", parentName: "", parentPhone: "" },
  ],
  teachers: [
    { id: "t1", name: "Öğretmen Bir" },
    { id: "t2", name: "Öğretmen İki" },
  ],
  lessons: [{ id: "l_m1", startAt: "2026-09-08T10:00:00.000Z" }],
  makeupRequests: [makeup("m1", "s1", "t1"), makeup("m2", "s2", "t2")],
  payments: [
    { id: "p_paid", studentId: "s1", status: "paid", amount: 1000, paidAmount: 1000, dueDate: "2026-09-01", paidAt: "2026-09-02T00:00:00.000Z", description: "Eylül", method: "havale" },
    { id: "p_pending", studentId: "s1", status: "pending", amount: 1000, paidAmount: 0, dueDate: "2026-10-01", description: "Ekim" },
    { id: "p_other", studentId: "s2", status: "paid", amount: 500, paidAmount: 500, dueDate: "2026-09-01", paidAt: "2026-09-02T00:00:00.000Z", description: "Eylül" },
  ],
  settings: { name: "Test Kurum", branches: [{ id: "erzene", name: "Erzene", phone: "" }] },
};

const ctx = (role: AppRole, extra: Partial<ServiceContext> = {}): ServiceContext => ({
  role,
  userId: "u_test",
  tenantId: DEFAULT_TENANT_ID,
  channel: "mobile",
  requestId: "req_mobile_read",
  ...extra,
});

async function makeupIds(c: ServiceContext) {
  const res = await listMakeupRequestsTool(c);
  if (!res.ok) throw new Error(res.error.code);
  return res.data.makeupRequests.map((m) => m.id);
}

beforeAll(async () => {
  await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "g_mobile_guardian" }, "s1", "GUARDIAN");
});

describe("listMakeupRequestsTool — GET /api/v1/makeup kapsamı", () => {
  it("öğretmen yalnız kendi kaydını görür; başkasınınkini göremez", async () => {
    expect(await makeupIds(ctx("TEACHER", { teacherId: "t1" }))).toEqual(["m1"]);
    expect(await makeupIds(ctx("TEACHER", { teacherId: "t2" }))).toEqual(["m2"]);
  });

  it("teacherId'siz öğretmen oturumu fail-closed", async () => {
    const res = await listMakeupRequestsTool(ctx("TEACHER"));
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
  });

  it("öğrenci (SELF) yalnız kendi kaydını görür", async () => {
    expect(await makeupIds(ctx("STUDENT", { userId: "user_student_s1", studentId: "s1" }))).toEqual(["m1"]);
  });

  it("veli (GUARDIAN) yalnız bağlı öğrencinin kaydını görür; ilişkisiz öğrenciyi göremez", async () => {
    expect(await makeupIds(ctx("STUDENT", { userId: "g_mobile_guardian", studentId: "s1" }))).toEqual(["m1"]);
  });

  it("aktif erişimi olmayan STUDENT hiçbir kayıt görmez (istemci studentId'si kapsam vermez)", async () => {
    expect(await makeupIds(ctx("STUDENT", { userId: "g_no_access", studentId: "s2" }))).toEqual([]);
  });

  it("kurum yöneticisi kurumun tüm kayıtlarını görür", async () => {
    expect((await makeupIds(ctx("SCHOOL_ADMIN"))).sort()).toEqual(["m1", "m2"]);
  });

  it.each([
    ["HYPER_ADMIN", {}],
    ["AI_AGENT", {}],
    ["BRANCH_MANAGER", {}],
    ["SCHOOL_ADMIN", { loginRole: "BRANCH_MANAGER" as AppRole }],
  ] as const)("%s fail-closed (403)", async (role, extra) => {
    const res = await listMakeupRequestsTool(ctx(role, extra));
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
  });

  it("yanıt yalnız gerçek domain verisi: iç alanlar sızmaz, statü/tarih kayıttan", async () => {
    const res = await listMakeupRequestsTool(ctx("TEACHER", { teacherId: "t1" }));
    if (!res.ok) throw new Error("beklenmeyen hata");
    const [row] = res.data.makeupRequests;
    expect(row).toMatchObject({ id: "m1", status: "pending", studentName: "Öğrenci Bir", teacherName: "Öğretmen Bir", sourceLessonStartAt: "2026-09-08T10:00:00.000Z" });
    expect(row?.confirmedLessonStartAt).toBeUndefined();
    expect(row).not.toHaveProperty("decidedBy");
    expect(row).not.toHaveProperty("decisionNote");
    expect(row).not.toHaveProperty("attendanceId");
  });
});

describe("getPaymentReceiptTool — GET /api/v1/payments/:id/receipt", () => {
  const self = () => ctx("STUDENT", { userId: "user_student_s1", studentId: "s1" });
  const guardian = () => ctx("STUDENT", { userId: "g_mobile_guardian", studentId: "s1" });

  it("öğrenci kendi tam ödenmiş ödemesinin makbuzunu alır (gerçek model, tahsil edilen tutar)", async () => {
    const res = await getPaymentReceiptTool(self(), { paymentId: "p_paid" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.eligible).toBe(true);
    expect(res.data.receipt).toMatchObject({ institutionName: "Test Kurum", studentName: "Öğrenci Bir", amount: 1000, branchName: "Erzene" });
    expect(res.data.receipt?.reference).toMatch(/^MKB-/);
  });

  it("veli bağlı öğrencinin makbuzunu alır; başka öğrencininkini alamaz", async () => {
    expect((await getPaymentReceiptTool(guardian(), { paymentId: "p_paid" })).ok).toBe(true);
    const other = await getPaymentReceiptTool(guardian(), { paymentId: "p_other" });
    expect(!other.ok && other.error.code).toBe("FORBIDDEN");
  });

  it("paymentId tek başına erişim vermez: başka öğrencinin ödemesi 403", async () => {
    const res = await getPaymentReceiptTool(self(), { paymentId: "p_other" });
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
  });

  it("ödenmemiş kayıt için makbuz yok — eligible:false + gerekçe (sahte makbuz yok)", async () => {
    const res = await getPaymentReceiptTool(self(), { paymentId: "p_pending" });
    expect(res.ok && res.data).toMatchObject({ eligible: false });
    expect(res.ok && res.data.receipt).toBeUndefined();
  });

  it("bilinmeyen ödeme 404", async () => {
    const res = await getPaymentReceiptTool(self(), { paymentId: "p_yok" });
    expect(!res.ok && res.error.code).toBe("NOT_FOUND");
  });

  it.each([
    ["TEACHER", { teacherId: "t1" }],
    ["HYPER_ADMIN", {}],
    ["AI_AGENT", {}],
    ["BRANCH_MANAGER", {}],
    ["SCHOOL_ADMIN", { loginRole: "BRANCH_MANAGER" as AppRole }],
  ] as const)("%s makbuz göremez (403)", async (role, extra) => {
    const res = await getPaymentReceiptTool(ctx(role, extra), { paymentId: "p_paid" });
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
  });
});

describe("salt-okunur sınır", () => {
  it("tool modülü store'a yazan hiçbir şey import etmez", () => {
    const src = readFileSync(path.join(__dirname, "../services/mobile-read.ts"), "utf8");
    expect(src).toMatch(/import \{ readMakeupCenterData, readPaymentById, readReferenceData \} from "\.\.\/store"/);
    expect(src).not.toMatch(/writeData|mutate|\.push\(|confirmSlot|cancelMakeup|markPaymentPaid/);
  });
});
