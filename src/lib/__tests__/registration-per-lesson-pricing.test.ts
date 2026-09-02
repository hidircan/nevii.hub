import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createStudentTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * P0-1 — "yeni öğrenci kayıt ödeme önizlemesi" yüzeyinin gerçek entegrasyonu:
 * `pricingModel:"per_lesson"` seçildiğinde `createStudentTool`, otomatik ilk
 * dönem tutarını `period-lesson-billing.ts`'teki TEK motordan (henüz gerçek
 * ders programı yokken `estimatePeriodBillingLines` PROJEKSİYONU) alır —
 * eski `monthlyFee` karşılaştırması DEĞİL.
 */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  vi.clearAllMocks();
});

function baseInput(overrides?: Record<string, unknown>) {
  return {
    name: "Ders Başı Ücret Testi",
    email: "",
    phone: "5551230001",
    parentName: "Veli",
    parentPhone: "5559870001",
    branchId: "erzene",
    instrument: "Piyano",
    teacherId: "t1",
    packageName: "Bireysel Aylık — 4 ders",
    weeklyLessonCount: 2,
    monthlyFee: 3000,
    pricingModel: "per_lesson" as const,
    perLessonNetFee: 500,
    enrollmentStartDate: "2026-09-15",
    ...overrides,
  };
}

describe("createStudentTool — per_lesson ücretlendirme modeli (P0-1)", () => {
  it("1) ay ortası başlangıç: otomatik ilk dönem tutarı PROJEKSİYON motorundan gelir, monthlyFee'den DEĞİL", async () => {
    // 2026-09-15 → 2026-09-30 (16 gün), haftada 2 ders: tahmini round(2*16/7)=5, 5*500=2500.
    const res = await createStudentTool(
      ctx(),
      baseInput({ firstPaymentCollected: { method: "cash", amount: 2500, collectedAt: "2026-09-15" } })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const payment = data.payments.find(
      (p) => p.studentId === res.data.studentId && p.source === "registration_first_payment"
    );
    expect(payment?.amount).toBe(2500);
    expect(payment?.autoSuggestedAmount).toBeUndefined(); // eşleşti, düzeltme YOK
    const student = data.students.find((s) => s.id === res.data.studentId);
    expect(student?.pricingModel).toBe("per_lesson");
    expect(student?.perLessonNetFee).toBe(500);
  });

  it("perLessonNetFee ile eşleşmeyen tutar gerekçesiz reddedilir", async () => {
    const res = await createStudentTool(
      ctx(),
      baseInput({ firstPaymentCollected: { method: "cash", amount: 999, collectedAt: "2026-09-15" } })
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("gerekçe zorunludur");
  });

  it("pricingModel=per_lesson ama perLessonNetFee yoksa zod reddeder", async () => {
    const res = await createStudentTool(
      ctx(),
      baseInput({
        perLessonNetFee: undefined,
        firstPaymentCollected: { method: "cash", amount: 2500, collectedAt: "2026-09-15" },
      })
    );
    expect(res.ok).toBe(false);
  });

  it("18) pricingModel verilmeyen (legacy) kayıt eski monthlyFee davranışını KORUR", async () => {
    const res = await createStudentTool(
      ctx(),
      baseInput({
        pricingModel: undefined,
        perLessonNetFee: undefined,
        firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-09-15" },
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const student = data.students.find((s) => s.id === res.data.studentId);
    expect(student?.pricingModel).toBeUndefined();
    expect(student?.perLessonNetFee).toBeUndefined();
    expect(student?.monthlyFee).toBe(3000);
  });
});
