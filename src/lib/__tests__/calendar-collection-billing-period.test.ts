/**
 * 2026-10-06 — Yoklama Takvimi ay kutusu: kutunun AYI ödenen dönemdir, girilen tarih TAHSİLAT tarihidir.
 * Olay: Ekim kutusuna 30.09.2026 girilen tahsilat Eylül'de görünüyordu (tarih vadeye yazılıp ay vadeden
 * türetiliyordu). Sentetik veri, sözleşmesiz öğrenci s1 (aylık ücret 3200).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { collectAttendanceCalendarPaymentTool, getAttendanceCalendarMonthTool } from "../services/tools";
import { readData } from "../store";
import { writeData } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { toZonedYmd } from "../timezone";
import { planStandaloneMonthlyAccruals } from "../standalone-monthly-accrual";
import type { ServiceContext } from "../services/context";
import type { Payment } from "../types";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
  const data = await readData();
  await writeData({ ...data, payments: data.payments.filter((p) => p.studentId !== "s1") });
});

const collect = (month: string, collectedAt: string, amount = 3200) =>
  collectAttendanceCalendarPaymentTool(admin, { studentId: "s1", month, amount, collectedAt, method: "transfer" });

/** "Yeniden yükleme": takvimin sunucu ay görünümü. */
async function monthPlan(year: number, month: number) {
  const res = await getAttendanceCalendarMonthTool(admin, { studentId: "s1", year, month });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.plan as { state: string; paidAmount?: number; remaining?: number; collections?: { paidAt: string; amount: number }[] };
}
const day = (iso: string) => toZonedYmd(new Date(iso), "Europe/Istanbul");

describe("ay kutusu tahsilatı — dönem = kutunun ayı, tarih = tahsilat tarihi", () => {
  it("1) Ekim kutusu + 30.09.2026 → Ekim ödenir, Eylül etkilenmez (yeniden okumada da)", async () => {
    expect((await collect("2026-10", "2026-09-30")).ok).toBe(true);
    const oct = await monthPlan(2026, 10);
    expect(oct.remaining).toBe(0);
    expect(oct.collections?.map((c) => day(c.paidAt))).toEqual(["2026-09-30"]);
    const sep = await monthPlan(2026, 9);
    expect(sep.paidAmount ?? 0).toBe(0);
    expect(sep.collections ?? []).toHaveLength(0);
  });

  it("2) Temmuz/Ağustos/Eylül ayrı ayrı 30.03.2026 → üç ayrı dönem, tahsilat tarihleri 30 Mart", async () => {
    for (const m of ["2026-07", "2026-08", "2026-09"]) expect((await collect(m, "2026-03-30")).ok).toBe(true);
    const rows = (await readData()).payments.filter((p) => p.studentId === "s1" && p.source === "monthly_plan");
    expect(rows.map((r) => r.installmentPeriodLabel).sort()).toEqual(["Ağustos 2026", "Eylül 2026", "Temmuz 2026"]);
    expect(rows.every((r) => day(r.paidAt!) === "2026-03-30")).toBe(true);
    for (const m of [7, 8, 9]) expect((await monthPlan(2026, m)).remaining).toBe(0);
    expect((await monthPlan(2026, 3)).collections ?? []).toHaveLength(0);
  });

  it("3) Aralık 2026 dönemi Ocak 2027'de tahsil edilir → Aralık 2026'ya sayılır, tahsilat tarihi Ocak", async () => {
    expect((await collect("2026-12", "2027-01-05")).ok).toBe(true);
    const dec = await monthPlan(2026, 12);
    expect(dec.remaining).toBe(0);
    expect(dec.collections?.map((c) => day(c.paidAt))).toEqual(["2027-01-05"]);
    expect((await monthPlan(2027, 1)).collections ?? []).toHaveLength(0);
  });

  it("4) kısmi ödeme ayı kapatmaz; ikinci tahsilat eklenir; tahakkuk aynı dönemi ikinci kez borçlandırmaz", async () => {
    expect((await collect("2026-11", "2026-10-28", 1000)).ok).toBe(true);
    let nov = await monthPlan(2026, 11);
    expect(nov.paidAmount).toBe(1000);
    expect(nov.remaining).toBe(2200);
    expect((await collect("2026-11", "2026-11-03", 2200)).ok).toBe(true);
    nov = await monthPlan(2026, 11);
    expect(nov.remaining).toBe(0);
    expect(nov.collections?.map((c) => c.amount)).toEqual([3200]);

    const data = await readData();
    const s1 = data.students.find((s) => s.id === "s1")!;
    const plan = (month: string) =>
      planStandaloneMonthlyAccruals({ students: [{ ...s1, enrollmentStartDate: "2026-01-10" }], payments: data.payments, contractStatusByStudent: new Map(), month });
    expect(plan("2026-11")).toHaveLength(0); // Kasım dönemi karşılandı (tahsilat Ekim'de başlasa bile)
    expect(plan("2026-10")).toHaveLength(1); // Ekim'de yapılan tahsilat Ekim'i karşılamaz
  });

  it("eski satır (açıklama Ekim, vade = tahsilat günü 30.09) Ekim'de görünür; aynı dönem için ikinci satır açılmaz", async () => {
    const data = await readData();
    const legacy: Payment = {
      id: "pay_legacy",
      studentId: "s1",
      amount: 3200,
      paidAmount: 3200,
      status: "paid",
      dueDate: "2026-09-30T12:00:00.000Z",
      paidAt: "2026-09-30T00:00:00.000Z",
      description: "Aylık plan — 2026-10 (3200 TL)",
      source: "monthly_plan",
      createdAt: "2026-10-03T08:47:54.000Z",
    } as Payment;
    await writeData({ ...data, payments: [...data.payments, legacy] });
    expect((await monthPlan(2026, 10)).remaining).toBe(0);
    expect((await monthPlan(2026, 9)).collections ?? []).toHaveLength(0);
    // Aynı değerle tekrar gönderim: aynı satır, ikinci kayıt yok.
    expect((await collect("2026-10", "2026-09-30")).ok).toBe(true);
    expect((await readData()).payments.filter((p) => p.studentId === "s1" && p.source === "monthly_plan")).toHaveLength(1);
  });
});
