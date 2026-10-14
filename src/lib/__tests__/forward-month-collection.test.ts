/**
 * 2026-10-14 — İLERİ AY TAHSİLATI. Olay: kayıtta "takip eden ayı da ekle" ile iki ay birden tahsil edilen
 * sözleşmesiz öğrencide yoklama takvimi tahsilatı yalnız ilk ayda gösteriyor, sonraki ayı "ödeme kaydı yok"
 * (borçlu gibi) gösteriyordu; gece tahakkuku ise aynı bayrağı okuyup o ayı borçlandırmıyordu — iki ayrı kural.
 * Ayrıca ay kutusuna iki aylık tutar girilince fazlası seçilen ayın satırına yazılıyor, sonraki ay yine borçlanıyordu.
 * Tek kural: `installmentMonthShares` (takvim, döküm, tahakkuk). Sentetik veri; s1 sözleşmesiz, aylık 3200.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { STUDENT_CONTRACTS_FILE, registrationFirstCollectionPeriods } from "../contracts";
import { allocateInOrder, installmentMonthShares, resolveContractPlanForMonth, type CalendarPlanInstallment } from "../attendance-calendar-plan";
import { collectAttendanceCalendarPaymentTool, createStudentTool, getAttendanceCalendarMonthTool } from "../services/tools";
import { planStandaloneMonthlyAccruals } from "../standalone-monthly-accrual";
import { readData } from "../store";
import { writeData } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { Payment, Student } from "../types";

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

function row(over: Partial<CalendarPlanInstallment> = {}): CalendarPlanInstallment {
  return { id: "fp", amount: 6000, paidAmount: 6000, dueDate: "2026-10-03T09:00:00.000Z", status: "paid", source: "registration_first_payment", paidAt: "2026-10-03T09:00:00.000Z", method: "cash", ...over };
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("installmentMonthShares — tek tahsilatın dönemlere dağılımı", () => {
  it("kabul örneği: Ekim + Kasım 3.000'er, tek 6.000 TL tahsilat → her ay 3.000 ödendi, kalan 0", () => {
    const fp = row({ installmentPeriodLabel: "Ekim 2026 + Kasım 2026", installmentBreakdown: [{ periodLabel: "Ekim 2026", amount: 3000 }, { periodLabel: "Kasım 2026", amount: 3000 }] });
    const shares = installmentMonthShares(fp);
    expect(shares.map((s) => [s.month, s.amount, s.paidAmount])).toEqual([["2026-10", 3000, 3000], ["2026-11", 3000, 3000]]);
    for (const m of [10, 11]) {
      const plan = resolveContractPlanForMonth({ contracts: [], installments: [fp], year: 2026, month: m, studentMonthlyFee: 3000 });
      expect(plan.state === "student_plan" && [plan.amount, plan.paidAmount, plan.remaining]).toEqual([3000, 3000, 0]);
      // Tahsilat satırı gerçek işlem tarihiyle, yalnız o aya mahsup edilen tutarla.
      expect(plan.state === "student_plan" && plan.collections).toEqual([{ paidAt: "2026-10-03T09:00:00.000Z", method: "cash", amount: 3000 }]);
    }
  });

  it("kısmi ödeme en eski döneme mahsup edilir; toplam mahsup tahsilatı aşmaz", () => {
    const shares = installmentMonthShares(row({ paidAmount: 4000, status: "partial", installmentBreakdown: [{ periodLabel: "Ekim 2026", amount: 3000 }, { periodLabel: "Kasım 2026", amount: 3000 }] }));
    expect(shares.map((s) => s.paidAmount)).toEqual([3000, 1000]);
    expect(sum(shares.map((s) => s.paidAmount))).toBe(4000);
    expect(sum(shares.map((s) => s.amount))).toBe(6000);
  });

  it("indirimli/manuel tutar kırılımdan azsa eksik son dönemde kalır; fazlaysa son döneme eklenir", () => {
    const bd = [{ periodLabel: "17–31 Ekim 2026", amount: 1500 }, { periodLabel: "Kasım 2026", amount: 3000 }];
    expect(installmentMonthShares(row({ amount: 4000, paidAmount: 4000, installmentBreakdown: bd })).map((s) => s.amount)).toEqual([1500, 2500]);
    expect(installmentMonthShares(row({ amount: 5000, paidAmount: 5000, installmentBreakdown: bd })).map((s) => s.amount)).toEqual([1500, 3500]);
  });

  it("iade/geri alma (ödenen 0) her iki dönemi açık borç yapar", () => {
    const shares = installmentMonthShares(row({ paidAmount: 0, status: "pending", installmentBreakdown: [{ periodLabel: "Ekim 2026", amount: 3000 }, { periodLabel: "Kasım 2026", amount: 3000 }] }));
    expect(shares.map((s) => s.paidAmount)).toEqual([0, 0]);
  });

  it("Aralık + Ocak yıl geçişi", () => {
    const p = registrationFirstCollectionPeriods({ startDay: "2026-12-14", firstPeriodEnd: "2026-12-31", firstPeriodAmount: 1800, includesNextMonth: true }, 3200);
    expect(p.installmentPeriodLabel).toBe("14–31 Aralık 2026 + Ocak 2027");
    const shares = installmentMonthShares(row({ amount: 5000, paidAmount: 5000, dueDate: "2026-12-14T09:00:00.000Z", ...p }));
    expect(shares.map((s) => [s.month, s.amount])).toEqual([["2026-12", 1800], ["2027-01", 3200]]);
  });

  it("dönem tahsilat tarihinden değil etiketten: Ağustos'ta peşin alınan Eylül + Ekim", () => {
    const p = registrationFirstCollectionPeriods({ startDay: "2026-09-19", firstPeriodEnd: "2026-09-30", firstPeriodAmount: 1500, includesNextMonth: true }, 3200);
    const shares = installmentMonthShares(row({ amount: 4700, paidAmount: 4700, dueDate: "2026-08-31T09:00:00.000Z", ...p }));
    expect(shares.map((s) => s.month)).toEqual(["2026-09", "2026-10"]);
  });

  it("kırılımsız ESKİ birleşik kayıt tahsilatı: sonraki ay karşılanmış ama tutarı tahmin edilmez (pay 0, işaretli)", () => {
    const shares = installmentMonthShares(row({ amount: 9937, paidAmount: 9937, dueDate: "2026-09-26T09:00:00.000Z", firstCollectionIncludesNextMonth: true }));
    expect(shares.map((s) => [s.month, s.amount, s.paidAmount, s.unsplit ?? false])).toEqual([["2026-09", 9937, 9937, false], ["2026-10", 0, 0, true]]);
    const oct = resolveContractPlanForMonth({ contracts: [], installments: [row({ amount: 9937, paidAmount: 9937, dueDate: "2026-09-26T09:00:00.000Z", firstCollectionIncludesNextMonth: true })], year: 2026, month: 10, studentMonthlyFee: 7950 });
    expect(oct.state === "student_plan" && oct.coveredByCombinedFirstCollection?.paymentId).toBe("fp");
    expect(oct.state === "student_plan" && oct.remaining).toBe(0);
  });

  it("allocateInOrder deterministik", () => {
    expect(allocateInOrder(7000, [3000, 3000])).toEqual([3000, 4000]);
    expect(allocateInOrder(-5, [3000])).toEqual([0]);
  });
});

describe("sözleşmesiz tahakkuk takvimle aynı kuralı okur", () => {
  const student = { id: "x1", active: true, monthlyFee: 3000, enrollmentStartDate: "2026-10-03" } as Student;
  const fp = { id: "fp", studentId: "x1", amount: 6000, paidAmount: 6000, status: "paid", dueDate: "2026-10-03T09:00:00.000Z", source: "registration_first_payment", description: "", installmentPeriodLabel: "Ekim 2026 + Kasım 2026", installmentBreakdown: [{ periodLabel: "Ekim 2026", amount: 3000 }, { periodLabel: "Kasım 2026", amount: 3000 }] } as Payment;
  const plan = (month: string, payments: Payment[]) =>
    planStandaloneMonthlyAccruals({ students: [student], payments, contractStatusByStudent: new Map(), month });

  it("Kasım karşılanmış → borç yazılmaz; Aralık normal borçlanır", () => {
    expect(plan("2026-11", [fp])).toEqual([]);
    expect(plan("2026-12", [fp]).map((a) => a.amount)).toEqual([3000]);
  });

  it("başka öğrencinin ödemesi bu öğrencinin ayını karşılamaz", () => {
    expect(plan("2026-11", [{ ...fp, studentId: "other" }]).map((a) => a.studentId)).toEqual(["x1"]);
  });

  it("iptal edilmiş (voided) kayıt tahsilatı ayı karşılamaz", () => {
    expect(plan("2026-11", [{ ...fp, status: "voided" }]).map((a) => a.month)).toEqual(["2026-11"]);
  });
});

describe("ay kutusu: tek tahsilat kalanı aşarsa sonraki aylara mahsup edilir (sentetik s1, aylık 3200)", () => {
  beforeEach(async () => {
    await fs.rm(path.join(DIR, "store.json"), { force: true });
    await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
    const data = await readData();
    await writeData({
      ...data,
      payments: data.payments.filter((p) => p.studentId !== "s1"),
      students: data.students.map((s) => (s.id === "s1" ? { ...s, enrollmentEndDate: undefined } : s)),
    });
  });

  const collect = (month: string, amount: number) =>
    collectAttendanceCalendarPaymentTool(admin, { studentId: "s1", month, amount, collectedAt: "2026-10-05", method: "cash" });
  const monthPlan = async (year: number, month: number) => {
    const res = await getAttendanceCalendarMonthTool(admin, { studentId: "s1", year, month });
    if (!res.ok) throw new Error(res.error.message);
    return res.data.plan as { state: string; amount: number; paidAmount: number; remaining: number };
  };

  it("Ekim kutusuna 6.400 → Ekim ve Kasım 3.200'er ödendi; toplam tahsilat 6.400; Kasım için ikinci tahsilat açılmaz", async () => {
    const res = await collect("2026-10", 6400);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.months).toEqual(["2026-10", "2026-11"]);
    for (const m of [10, 11]) {
      const p = await monthPlan(2026, m);
      expect([p.amount, p.paidAmount, p.remaining]).toEqual([3200, 3200, 0]);
    }
    const rows = (await readData()).payments.filter((p) => p.studentId === "s1");
    expect(rows).toHaveLength(2);
    expect(sum(rows.map((r) => r.paidAmount))).toBe(6400);

    // Mükerrer istek (çift tık): aynı sonuç döner, yeni satır/tahsilat yazılmaz.
    const again = await collect("2026-10", 6400);
    expect(again.ok).toBe(true);
    const after = (await readData()).payments.filter((p) => p.studentId === "s1");
    expect(after).toHaveLength(2);
    expect(sum(after.map((r) => r.paidAmount))).toBe(6400);

    // Gece tahakkuku Kasım'ı tekrar borçlandırmaz.
    const data = await readData();
    const accr = planStandaloneMonthlyAccruals({ students: data.students.filter((s) => s.id === "s1"), payments: data.payments, contractStatusByStudent: new Map(), month: "2026-11" });
    expect(accr).toEqual([]);
  });

  it("kısmi ileri ay: 4.000 → Ekim 3.200 ödendi, Kasım 800 kısmi (kalan 2.400)", async () => {
    expect((await collect("2026-10", 4000)).ok).toBe(true);
    expect((await monthPlan(2026, 10)).remaining).toBe(0);
    const nov = await monthPlan(2026, 11);
    expect([nov.paidAmount, nov.remaining]).toEqual([800, 2400]);
  });

  it("Aralık kutusuna iki ay → Aralık 2026 + Ocak 2027", async () => {
    const res = await collect("2026-12", 6400);
    expect(res.ok && res.data.months).toEqual(["2026-12", "2027-01"]);
    expect((await monthPlan(2027, 1)).remaining).toBe(0);
  });

  it("kayıt bitişinden sonraki aya avans yazılmaz; hiçbir şey yazılmadan açık hata döner", async () => {
    const data = await readData();
    await writeData({ ...data, students: data.students.map((s) => (s.id === "s1" ? { ...s, enrollmentEndDate: "2026-10-31" } : s)) });
    const res = await collect("2026-10", 6400);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("kayıt bitişi");
    expect((await readData()).payments.filter((p) => p.studentId === "s1")).toHaveLength(0);
  });

  it("ESKİ birleşik kayıt tahsilatının kapsadığı ay kutusundan ikinci tahsilat yazılmaz", async () => {
    const data = await readData();
    const legacy: Payment = { id: "pay_legacy_fp", studentId: "s1", amount: 4700, paidAmount: 4700, status: "paid", dueDate: "2026-09-20T09:00:00.000Z", paidAt: "2026-09-20T09:00:00.000Z", description: "İlk Ödeme — Kayıt Anında Tahsil Edildi", source: "registration_first_payment", firstCollectionIncludesNextMonth: true, createdAt: "2026-09-20T09:00:00.000Z" };
    await writeData({ ...data, payments: [...data.payments, legacy] });
    const res = await collect("2026-10", 3200);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("ilk tahsilata dahil");
    expect((await readData()).payments.filter((p) => p.studentId === "s1")).toHaveLength(1);
  });
});

describe("kayıt: 'takip eden ayı da ekle' seçimi dönem kırılımıyla kalıcı yazılır (sözleşmesiz)", () => {
  beforeEach(async () => {
    await fs.rm(path.join(DIR, "store.json"), { force: true });
    await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
  });

  it("Ekim kaydı + Kasım peşin → satır 'Ekim 2026 + Kasım 2026'; takvimde Kasım ödendi; tahakkuk Kasım'ı borçlandırmaz", async () => {
    const res = await createStudentTool(admin, {
      name: "İleri Ay Testi",
      email: "",
      phone: "5551239900",
      parentName: "Veli",
      parentPhone: "5559879900",
      branchId: "erzene",
      instrument: "Piyano",
      teacherId: "t1",
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
      enrollmentStartDate: "2026-10-01",
      firstCollectionIncludesNextMonth: true,
      firstPaymentCollected: { method: "cash", amount: 6000, collectedAt: "2026-10-01" },
      firstPaymentAdjustmentReason: "İki ay peşin",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const fp = data.payments.find((p) => p.studentId === res.data.studentId && p.source === "registration_first_payment")!;
    expect(fp.amount).toBe(6000);
    expect(fp.installmentPeriodLabel).toBe("Ekim 2026 + Kasım 2026");
    expect(fp.installmentBreakdown?.map((b) => b.periodLabel)).toEqual(["Ekim 2026", "Kasım 2026"]);
    const shares = installmentMonthShares(fp);
    expect(sum(shares.map((x) => x.paidAmount))).toBe(6000);

    const nov = await getAttendanceCalendarMonthTool(admin, { studentId: res.data.studentId, year: 2026, month: 11 });
    expect(nov.ok && nov.data.plan.state === "student_plan" && nov.data.plan.remaining).toBe(0);
    const accr = planStandaloneMonthlyAccruals({ students: data.students.filter((x) => x.id === res.data.studentId), payments: data.payments, contractStatusByStudent: new Map(), month: "2026-11" });
    expect(accr).toEqual([]);
  });
});
