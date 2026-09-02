import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createStudentTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * Owner policy (2026-08-30) — "İlk ödeme her zaman kayıt esnasında alınacaktır.
 * İlk ödeme alınmadan kayıt tamamlanmayacaktır." Bu testler, ASIL kayıt
 * tamamlanma sınırını (`createStudentTool`, `contracts.ts`/`createContract`
 * DEĞİL) doğrular — bkz. docs/contracts/FIRST_PAYMENT_AT_REGISTRATION_POLICY_REPORT.md.
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
    name: "Kayıt Sınırı Testi",
    email: "",
    phone: "5551230000",
    parentName: "Veli",
    parentPhone: "5559870000",
    branchId: "erzene",
    instrument: "Piyano",
    teacherId: "t1",
    packageName: "Bireysel Aylık — 4 ders",
    weeklyLessonCount: 1,
    monthlyFee: 3000,
    ...overrides,
  };
}

describe("createStudentTool — kayıt tamamlanma sınırında ilk ödeme zorunluluğu", () => {
  it("firstPaymentCollected verilmezse kayıt TAMAMLANAMAZ, tam metin döner", async () => {
    const res = await createStudentTool(ctx(), baseInput());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).toBe("İlk ödeme kayıt sırasında tahsil edilmeden kayıt tamamlanamaz.");

    const data = await readData();
    expect(data.students.find((s) => s.phone === "5551230000")).toBeUndefined();
  });

  it("ayın 1'inde tahsil edilen ilk ödeme, istisna gerekçesi OLMADAN kabul edilir", async () => {
    const res = await createStudentTool(
      ctx(),
      baseInput({
        enrollmentStartDate: "2026-09-01",
        firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-09-01" },
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const payment = data.payments.find(
      (p) => p.studentId === res.data.studentId && p.source === "registration_first_payment"
    );
    expect(payment).toBeDefined();
    expect(payment?.status).toBe("paid");
    expect(payment?.paidAmount).toBe(3000);
  });

  it("ayın 31'inde tahsil edilen ilk ödeme de İSTİSNA GEREKÇESİ İSTEMEDEN kabul edilir (gün-of-ay penceresi burada uygulanmaz)", async () => {
    // P0-1 (2026-09-02) — `firstPaymentExceptionReason` (bu testin konusu,
    // TARİH istisnası) hâlâ gerekmiyor; ama enrollmentStartDate=ayın SON
    // günü artık 1 günlük bir "ilk dönem" ürettiği için otomatik önerilen
    // TUTAR da (ayrı, yeni bir kavram — `firstPaymentAdjustmentReason`)
    // 3000'den farklı çıkıyor — bu İKİSİ birbirinden bağımsız gerekçe alanı.
    const res = await createStudentTool(
      ctx(),
      baseInput({
        enrollmentStartDate: "2026-08-31",
        firstPaymentCollected: { method: "transfer", amount: 3000, collectedAt: "2026-08-31" },
        firstPaymentAdjustmentReason: "Ay sonu kayıt — tam aylık tutar tahsil edildi",
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const student = data.students.find((s) => s.id === res.data.studentId);
    expect(student).toBeDefined();
  });

  it("Owner policy (2026-08-30, final) — tahsilat tarihi ile enrollmentStartDate (ders/eğitim başlangıcı) FARKLI olsa da istisna/gerekçe GEREKTİRMEZ, normal kabul edilir", async () => {
    // Bu testin konusu TARİH istisnası (firstPaymentExceptionReason, aşağıda);
    // P0-1 (2026-09-02) ay-ortası enrollmentStartDate ile otomatik türetilen
    // TUTAR da 3000'den farklı çıktığı için (ayrı, yeni bir kavram) ayrıca
    // firstPaymentAdjustmentReason gerekiyor — ikisi birbirinden bağımsız.
    const res = await createStudentTool(
      ctx(),
      baseInput({
        enrollmentStartDate: "2026-09-05",
        firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-09-10" },
        firstPaymentAdjustmentReason: "Test — tam aylık tutar tahsil edildi",
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const payment = data.payments.find(
      (p) => p.studentId === res.data.studentId && p.source === "registration_first_payment"
    );
    expect(payment?.status).toBe("paid");
  });

  it("firstPaymentExceptionReason GÖNDERİLSE BİLE (eski istemci) sonucu etkilemez — sunucu artık bu alanı kullanmaz", async () => {
    const res = await createStudentTool(
      ctx(),
      baseInput({
        enrollmentStartDate: "2026-09-05",
        firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-09-10" },
        firstPaymentExceptionReason: "Veli bankada gecikme yaşadı, yetkili onayı ile kabul edildi.",
        firstPaymentAdjustmentReason: "Test — tam aylık tutar tahsil edildi",
      })
    );
    expect(res.ok).toBe(true);
  });

  it("P0-1B — tahsil edilen tutar otomatik tutardan farklı ve GEREKÇESİZ ise reddedilir (sahte/izsiz kayıt engeli)", async () => {
    const res = await createStudentTool(
      ctx(),
      baseInput({ firstPaymentCollected: { method: "cash", amount: 1, collectedAt: "2026-08-30" } })
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("gerekçe zorunludur");
  });

  it("P0-1B — otomatik tutardan farklı ama GERÇEK GEREKÇELİ ilk ödeme kabul edilir, audit izi bırakır", async () => {
    const res = await createStudentTool(
      ctx(),
      baseInput({
        firstPaymentCollected: { method: "cash", amount: 1, collectedAt: "2026-08-30" },
        firstPaymentAdjustmentReason: "Aile maddi zorluk, yönetici onayı",
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const payment = data.payments.find(
      (p) => p.studentId === res.data.studentId && p.source === "registration_first_payment"
    );
    expect(payment?.amount).toBe(1);
    expect(payment?.autoSuggestedAmount).toBe(3000);
    expect(payment?.adjustmentReason).toBe("Aile maddi zorluk, yönetici onayı");
    expect(payment?.adjustedBy).toBeTruthy();
    expect(payment?.adjustedAt).toBeTruthy();
  });

  it("çift gönderim/retry ikinci bir öğrenci/ödeme YARATMAZ, ilk oluşturulan kayıt döner", async () => {
    const input = baseInput({
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" },
    });
    const first = await createStudentTool(ctx(), input);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = await createStudentTool(ctx(), input);
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.data.studentId).toBe(first.data.studentId);

    const data = await readData();
    const matchingStudents = data.students.filter((s) => s.phone === "5551230000");
    expect(matchingStudents.length).toBe(1);
    const payments = data.payments.filter((p) => p.source === "registration_first_payment");
    expect(payments.length).toBe(1);
  });

  it("RBAC — TEACHER/PARENT rolleri öğrenci kaydı oluşturamaz (ilk ödeme kapısına ulaşmadan reddedilir)", async () => {
    const res = await createStudentTool(
      ctx({ role: "TEACHER", teacherId: "t1" }),
      baseInput({ firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" } })
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });
});

/**
 * NOT — gerçek çapraz-tenant izolasyonu yalnızca STORE_MODE=db ve 2+ gerçek
 * `Tenant` satırıyla gözlemlenebilir (bkz. CLAUDE.md "mode parity"); json/memory
 * modda `readData()` DEFAULT_TENANT_ID'ye düşer, bu yüzden burada AYRI bir
 * "farklı tenantId reddedilir" testi YAZILMADI — mevcut RBAC/tenant-scoped
 * öğretmen/şube bulma testleri (create-student-catalog-instrument.test.ts,
 * student-teacher-instrument-filter.test.ts) zaten aynı `data.teachers`
 * tenant-scoped arama davranışını dolaylı olarak kapsıyor.
 */
