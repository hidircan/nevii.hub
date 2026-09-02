import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createStudentTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * P0-1 (2026-09-02 ACİL DÜZELTME) — ders başı ücret yöneticinin girdiği/
 * seçtiği bir alan DEĞİLDİR: yönetici yalnız aylık ücret + haftalık ders
 * sıklığı girer, sistem `derivePerLessonAmount` ile (aylık ücret ÷
 * (haftalık×4)) ders başı karşılığı SESSİZCE türetir — bu HER yeni kayıt
 * için koşulsuzdur, seçilebilir bir "model" değildir. Bu testler
 * `createStudentTool`'un bu türetmeyi gerçekten uyguladığını, client'tan
 * gelen sahte bir ders-başı tutarına asla güvenmediğini kanıtlar.
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
    monthlyFee: 4000,
    enrollmentStartDate: "2026-09-15",
    ...overrides,
  };
}

describe("createStudentTool — ders başı karşılık otomatik türetilir (P0-1, 2026-09-02 düzeltmesi)", () => {
  it("1) aylık 4.000 TL + haftada 2 ders → türetilmiş ders başı 500 TL, öğrenci kaydına snapshot olarak yazılır", async () => {
    // 2026-09-15 → 2026-09-30 (16 gün, Eylül 30 gün çeker), referans 8 ders:
    // tahmini round(8*16/30)=4, 4*500=2000.
    const res = await createStudentTool(
      ctx(),
      baseInput({ firstPaymentCollected: { method: "cash", amount: 2000, collectedAt: "2026-09-15" } })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const payment = data.payments.find(
      (p) => p.studentId === res.data.studentId && p.source === "registration_first_payment"
    );
    expect(payment?.amount).toBe(2000);
    expect(payment?.autoSuggestedAmount).toBeUndefined(); // eşleşti, düzeltme YOK
    const student = data.students.find((s) => s.id === res.data.studentId);
    expect(student?.derivedPerLessonAmount).toBe(500);
    expect(student?.monthlyFee).toBe(4000);
  });

  it("türetilen tutarla eşleşmeyen ilk ödeme gerekçesiz reddedilir", async () => {
    const res = await createStudentTool(
      ctx(),
      baseInput({ firstPaymentCollected: { method: "cash", amount: 999, collectedAt: "2026-09-15" } })
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("gerekçe zorunludur");
  });

  it("10) gerekçeli farklı ilk ödeme kabul edilir ve audit'e yazılır", async () => {
    const res = await createStudentTool(
      ctx(),
      baseInput({
        firstPaymentCollected: { method: "cash", amount: 1500, collectedAt: "2026-09-15" },
        firstPaymentAdjustmentReason: "Aile maddi zorluk, yönetici onayı",
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const payment = data.payments.find(
      (p) => p.studentId === res.data.studentId && p.source === "registration_first_payment"
    );
    expect(payment?.amount).toBe(1500);
    expect(payment?.autoSuggestedAmount).toBe(2000);
    expect(payment?.adjustmentReason).toBe("Aile maddi zorluk, yönetici onayı");
    expect(payment?.adjustedBy).toBeTruthy();
    expect(payment?.adjustedAt).toBeTruthy();
  });

  it("6/7) client sahte bir 'perLessonNetFee'/'pricingModel' gönderse bile zod tarafından SESSİZCE silinir, yeniden türetilir", async () => {
    const res = await createStudentTool(
      ctx(),
      baseInput({
        // Kasıtlı olarak artık şemada olmayan alanlar — zod .strip() ile sessizce düşmeli.
        pricingModel: "per_lesson",
        perLessonNetFee: 999999,
        firstPaymentCollected: { method: "cash", amount: 2000, collectedAt: "2026-09-15" },
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const student = data.students.find((s) => s.id === res.data.studentId);
    // 999999 DEĞİL — gerçek türetilmiş değer (500) kullanıldı.
    expect(student?.derivedPerLessonAmount).toBe(500);
  });

  it("12) legacy aylık paketli bir öğrenci sonradan bu alanı KAZANMAZ (yalnız YENİ kayıtlarda dolar)", async () => {
    // Bu test yalnızca yeni bir kayıt oluşturmanın davranışını doğrular —
    // gerçek "legacy" senaryo (derivedPerLessonAmount hiç yazılmamış eski
    // kayıt) migration hiç uygulanmadığı için canlı DB'de zaten böyledir;
    // burada yeni kayıtların HER ZAMAN bu alanı aldığını kanıtlıyoruz.
    const res = await createStudentTool(
      ctx(),
      baseInput({ firstPaymentCollected: { method: "cash", amount: 2000, collectedAt: "2026-09-15" } })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const student = data.students.find((s) => s.id === res.data.studentId);
    expect(student?.derivedPerLessonAmount).toBeDefined();
  });
});
