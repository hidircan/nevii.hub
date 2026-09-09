/**
 * P0 (2026-09-09) — Yoklama Takvimi ay tutarı SÖZLEŞME PLANINDAN gelir
 * (uçtan uca, gerçek tool'lar + gerçek store).
 *
 * `attendance-calendar-plan.test.ts` saf çözümleyiciyi kilitler; bu dosya
 * gerçek zinciri doğrular: createStudentContractTool → dondurulmuş taksit
 * satırları → getAttendanceCalendarMonthTool → collectAttendanceCalendarPaymentTool.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createStudentContractTool,
  cancelStudentContractTool,
  getAttendanceCalendarMonthTool,
  collectAttendanceCalendarPaymentTool,
} from "../services/tools";
import { buildInstallmentSchedule, STUDENT_CONTRACTS_FILE, listContractsForStudent } from "../contracts";
import { DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE } from "../documents";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
  await fs.rm(DOCUMENT_TEMPLATES_FILE, { force: true });
  await fs.rm(DOCUMENT_INSTANCES_FILE, { force: true });
});

async function seedRegistrationFirstPayment(studentId: string, amount: number, collectedAt: string) {
  const { addRegistrationFirstPayment } = await import("../store-json");
  await addRegistrationFirstPayment({ studentId, method: "cash", amount, collectedAt, receivedByUserId: "u1" });
}

/** 3 aylık formal sözleşme; ilk taksit tutarı GERÇEK zamanlama fonksiyonundan gelir. */
async function createContractFor(
  monthlyAmount: number,
  overrides: Record<string, unknown> = {},
  depositAmount?: number
) {
  const durationMonths = 3;
  const installmentCount = 3;
  const firstDueDate = "2026-09-01T00:00:00.000Z";
  const firstInstallmentAmount =
    buildInstallmentSchedule({
      totalContractAmount: durationMonths * monthlyAmount,
      depositAmount,
      installmentCount,
      firstDueDate,
    })[0]!.amount;
  await seedRegistrationFirstPayment("s1", firstInstallmentAmount, firstDueDate);
  return createStudentContractTool(adminCtx(), {
    studentId: "s1",
    contractType: "initial",
    programmeName: "Piyano",
    enrollmentStartDate: "2026-09-01T00:00:00.000Z",
    enrollmentEndDate: "2026-12-01T00:00:00.000Z",
    durationMonths,
    monthlyAmount,
    installmentCount,
    firstDueDate,
    signatoryFullName: "Selin Arslan",
    signatoryRelationship: "veli",
    ...(depositAmount !== undefined ? { depositAmount } : {}),
    firstPaymentCollected: { method: "cash", amount: firstInstallmentAmount, collectedAt: firstDueDate },
    ...overrides,
  });
}

async function calendarPlan(year: number, month: number) {
  const res = await getAttendanceCalendarMonthTool(adminCtx(), { studentId: "s1", year, month });
  if (!res.ok) throw new Error(`takvim okunamadı: ${res.error.message}`);
  return res.data.plan;
}

describe("Senaryo 1 — 3 aylık / aylık 5.950 TL sözleşme: takvim planla AYNI tutarı gösterir", () => {
  it("her normal ay tam 5.950 TL", async () => {
    const created = await createContractFor(5950);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.installments.map((i) => i.amount)).toEqual([5950, 5950, 5950]);

    for (const month of [9, 10, 11]) {
      const plan = await calendarPlan(2026, month);
      expect(plan.state).toBe("ok");
      if (plan.state !== "ok") return;
      expect(plan.amount).toBe(5950);
      expect(plan.contractNumber).toBe(created.data.contract.contractNumber);
    }
  });
});

describe("Senaryo 2 — takvim, EŞİT BÖLÜNMEYEN dondurulmuş tutarları da AYNEN yansıtır", () => {
  it("plan 967/967/966 ise takvim de 967/967/966 gösterir", async () => {
    // Kaparo (100 TL) düşüldükten sonra 2.900 TL üç taksite tam bölünmez;
    // yuvarlama artığı İLK taksitlere dağıtılır → [967, 967, 966].
    //
    // Bu desen, tutarın gerçekten SNAPSHOT'tan okunduğunun kanıtıdır: aylık
    // ücretten oranlayan HERHANGİ bir yeniden hesaplama üç ayda da AYNI sayıyı
    // verirdi ve Kasım'ın 1 TL eksik olduğunu asla bilemezdi.
    const created = await createContractFor(1000, {}, 100);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.installments.map((i) => i.amount)).toEqual([967, 967, 966]);

    const eylul = await calendarPlan(2026, 9);
    const ekim = await calendarPlan(2026, 10);
    const kasim = await calendarPlan(2026, 11);
    if (eylul.state !== "ok" || ekim.state !== "ok" || kasim.state !== "ok") throw new Error("ok bekleniyordu");
    expect([eylul.amount, ekim.amount, kasim.amount]).toEqual([967, 967, 966]);
  });
});

describe("Senaryo 3 — sözleşmeden SONRA ders sayısı değişse de takvim snapshot'ı korur", () => {
  it("aya yeni dersler eklenince tutar DEĞİŞMEZ", async () => {
    const created = await createContractFor(5950);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const before = await calendarPlan(2026, 10);
    if (before.state !== "ok") throw new Error("ok bekleniyordu");
    expect(before.amount).toBe(5950);

    // Ekim'e 4 ek ders yaz (doğrudan store'a — createLessonTool geçmiş/çakışma
    // kurallarına takılmasın; test edilen şey ders OLUŞTURMA değil, takvimin
    // tutarı ders sayısından TÜRETMEMESİ).
    const { readData: readJson, writeData: writeJson } = await import("../store-json");
    const data = await readJson();
    const base = data.lessons.find((l) => l.studentId === "s1")!;
    for (const day of [5, 12, 19, 26]) {
      data.lessons.push({
        ...base,
        id: `les_extra_${day}`,
        startAt: `2026-10-${String(day).padStart(2, "0")}T11:00:00.000Z`,
        endAt: `2026-10-${String(day).padStart(2, "0")}T11:30:00.000Z`,
        status: "scheduled",
      });
    }
    await writeJson(data);

    const after = await calendarPlan(2026, 10);
    if (after.state !== "ok") throw new Error("ok bekleniyordu");
    expect(after.amount).toBe(5950);
    expect(after.amount).toBe(before.amount);
  });
});

describe("Senaryo 4 — plan satırı olmayan ay", () => {
  it("sözleşme yokken AÇIK durum döner, tutar uydurulmaz", async () => {
    const plan = await calendarPlan(2026, 10);
    expect(plan.state).toBe("no_active_contract");
    if (plan.state !== "no_active_contract") return;
    expect(plan.message).toBe("Bu ay için aktif ödeme planı bulunmuyor.");
  });

  it("sözleşme var ama o ay kapsam dışıysa (Aralık) tutar üretilmez", async () => {
    const created = await createContractFor(5950);
    expect(created.ok).toBe(true);
    // Sözleşme 2026-09-01 → 2026-12-01; taksitler Eylül/Ekim/Kasım.
    const plan = await calendarPlan(2026, 12);
    expect(plan.state).toBe("no_installment_for_month");
  });
});

describe("Senaryo 5 — tahsilat AYNI plan satırına yazılır; ödenen/kalan/durum doğru", () => {
  it("kısmi tahsilat sonrası takvim partial + kalan borcu gösterir", async () => {
    const created = await createContractFor(5950);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const res = await collectAttendanceCalendarPaymentTool(adminCtx(), {
      studentId: "s1",
      month: "2026-10",
      amount: 2000,
      note: "Kısmi tahsilat — P0 testi",
    });
    expect(res.ok).toBe(true);

    const plan = await calendarPlan(2026, 10);
    if (plan.state !== "ok") throw new Error("ok bekleniyordu");
    expect(plan.amount).toBe(5950); // dondurulmuş tutar DEĞİŞMEZ
    expect(plan.paidAmount).toBe(2000);
    expect(plan.remaining).toBe(3950);
    expect(plan.status).toBe("partial");
  });

  it("tahsilat AYRI bir monthly_plan satırı YARATMAZ — sözleşme taksiti ödenir", async () => {
    const created = await createContractFor(5950);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const ekimTaksit = created.data.installments.find((i) => i.dueDate.slice(0, 7) === "2026-10")!;

    const res = await collectAttendanceCalendarPaymentTool(adminCtx(), {
      studentId: "s1",
      month: "2026-10",
      amount: 5950,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Tahsil edilen satır, sözleşmenin O AYA ait taksitidir.
    expect(res.data.paymentId).toBe(ekimTaksit.paymentId);

    const data = await readData();
    const monthlyPlanRows = data.payments.filter((p) => p.studentId === "s1" && p.source === "monthly_plan");
    expect(monthlyPlanRows).toHaveLength(0);

    const plan = await calendarPlan(2026, 10);
    if (plan.state !== "ok") throw new Error("ok bekleniyordu");
    expect(plan.remaining).toBe(0);
    expect(plan.status).toBe("paid");
  });

  it("sözleşmesi OLMAYAN öğrencide eski serbest aylık plan davranışı korunur", async () => {
    const res = await collectAttendanceCalendarPaymentTool(adminCtx(), {
      studentId: "s1",
      month: "2026-10",
      amount: 1500,
    });
    expect(res.ok).toBe(true);
    const data = await readData();
    const monthlyPlanRows = data.payments.filter((p) => p.studentId === "s1" && p.source === "monthly_plan");
    expect(monthlyPlanRows).toHaveLength(1);
    expect(monthlyPlanRows[0]!.paidAmount).toBe(1500);
  });
});

describe("Senaryo 6 — iptal edilmiş sözleşme ödeme kaynağı OLAMAZ", () => {
  it("sözleşme iptal edilince takvim 'aktif plan yok' durumuna döner", async () => {
    const created = await createContractFor(5950);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await calendarPlan(2026, 10)).state).toBe("ok");

    const cancelled = await cancelStudentContractTool(adminCtx(), {
      contractId: created.data.contract.id,
      reason: "P0 testi — iptal senaryosu",
    });
    expect(cancelled.ok).toBe(true);

    const plan = await calendarPlan(2026, 10);
    expect(plan.state).toBe("no_active_contract");
  });
});

describe("Senaryo 7 — tenant izolasyonu", () => {
  it("başka kurumun bağlamıyla sözleşme planı okunamaz", async () => {
    const created = await createContractFor(5950);
    expect(created.ok).toBe(true);

    // Sözleşme listesi tenant filtrelidir — başka tenant için BOŞ döner.
    const otherTenantContracts = await listContractsForStudent("tenant_baska_kurum", "s1");
    expect(otherTenantContracts).toHaveLength(0);
  });

  it("takvim tool'u başka kurumun bağlamında öğrenciyi bulamaz", async () => {
    await createContractFor(5950);
    const res = await getAttendanceCalendarMonthTool(
      adminCtx({ tenantId: "tenant_baska_kurum" }),
      { studentId: "s1", year: 2026, month: 10 }
    );
    // Öğrenci o kuruma ait olmadığı için plan/tutar HİÇ üretilmez.
    if (res.ok) {
      expect(res.data.plan.state).not.toBe("ok");
    } else {
      expect(["NOT_FOUND", "FORBIDDEN"]).toContain(res.error.code);
    }
  });
});
