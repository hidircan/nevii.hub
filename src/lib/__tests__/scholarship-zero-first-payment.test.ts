/**
 * 2026-09-30 — %100 indirimli/burslu yeni kayıt "Formda düzeltilmesi gereken alanlar var"
 * ile reddediliyordu. Kök neden: `studentSchema.firstPaymentCollected.amount` `positive()`
 * idi (0 geçersiz) ve hata `firstPaymentCollected` anahtarına düştüğü için formda hiçbir alan
 * mesajı görünmüyordu; sözleşme tarafında da `monthlyAmount <= 0` + "ilk tahsilat > 0" engeli
 * vardı. Kural: 0 geçerli yalnız önerilen tutar 0 iken; bu durumda Payment satırı YAZILMAZ.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createDiscountCampaignTool, createPackageTool, createStudentTool, createStudentContractTool } from "../services/tools";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE } from "../documents";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { parseRegistrationFirstPaymentForm } from "../first-payment-adjustment";

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const ctx = (role: ServiceContext["role"] = "SCHOOL_ADMIN"): ServiceContext => ({
  role,
  userId: "u1",
  tenantId: DEFAULT_TENANT_ID,
  channel: "web",
});

beforeEach(async () => {
  for (const f of [DATA_FILE, STUDENT_CONTRACTS_FILE, DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE]) {
    await fs.rm(f, { force: true });
  }
});

const base = {
  name: "Burslu Öğrenci",
  email: "",
  phone: "5551112233",
  parentName: "Veli Adı",
  parentPhone: "5559998877",
  branchId: "erzene",
  instrument: "Piyano",
  teacherId: "t1",
  packageName: "Bireysel",
  weeklyLessonCount: 1,
  lessonDays: [2],
  monthlyFee: 1,
  notes: "",
  enrollmentStartDate: "2026-10-01",
  lessonDurationMinutes: 40,
};

async function packageWithCampaign(percent: number) {
  const pkg = await createPackageTool(ctx("SUPER_ADMIN"), { title: "Bireysel", price30Min: 2000, price40Min: 2500, price50Min: 3000 });
  const camp = await createDiscountCampaignTool(ctx("SUPER_ADMIN"), { name: `Kampanya ${percent}`, kind: "sibling", discountPercent: percent });
  if (!pkg.ok || !camp.ok) throw new Error("fixture");
  return { packageId: pkg.data.packageId, campaignIds: [camp.data.campaignId] };
}

const paymentsOf = async (studentId: string) => (await readData()).payments.filter((p) => p.studentId === studentId);

describe("parseRegistrationFirstPaymentForm — boş ≠ 0", () => {
  it("boş tutar alan hatası verir", () => {
    const r = parseRegistrationFirstPaymentForm({ method: "", amount: "  ", collectedAt: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors)).toEqual(["firstPaymentAmount"]);
  });
  it("0 geçerli; yöntem/tarih istenmez ve seçilmiş olsalar da taşınmaz", () => {
    const r = parseRegistrationFirstPaymentForm({ method: "cash", amount: "0", collectedAt: "2026-09-30" });
    expect(r).toEqual({ ok: true, value: { amount: 0, method: undefined, collectedAt: undefined, reference: undefined, note: undefined } });
  });
  it("tutar > 0 iken yöntem ve tarih alan bazında zorunlu", () => {
    const r = parseRegistrationFirstPaymentForm({ method: "", amount: "3.000", collectedAt: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["firstPaymentDate", "firstPaymentMethod"]);
  });
});

describe("%100 kampanya + 0 TL ilk tahsilat", () => {
  it("öğrenci oluşur, sahte ödeme yazılmaz; yeniden deneme mükerrer kayıt üretmez", async () => {
    const fixture = await packageWithCampaign(100);
    const input = { ...base, ...fixture, firstPaymentCollected: { amount: 0 } };
    const first = await createStudentTool(ctx(), input);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const student = (await readData()).students.find((s) => s.id === first.data.studentId)!;
    expect(student.monthlyFee).toBe(0);
    expect(await paymentsOf(student.id)).toHaveLength(0);

    const retry = await createStudentTool(ctx(), input);
    expect(retry.ok && retry.data.studentId).toBe(student.id);
    expect((await readData()).students.filter((s) => s.name === base.name)).toHaveLength(1);
    expect(await paymentsOf(student.id)).toHaveLength(0);

    // Sözleşme: aylık 0 TL, ilk tahsilat istenmez, taksit/ödeme satırı oluşmaz; yeniden deneme de yazmaz.
    const contract = await createStudentContractTool(ctx(), {
      studentId: student.id,
      contractType: "initial",
      programmeName: "Piyano",
      enrollmentStartDate: "2026-10-01T00:00:00.000Z",
      enrollmentEndDate: "2027-01-01T00:00:00.000Z",
      durationMonths: 3,
      monthlyAmount: 0,
      installmentCount: 3,
      firstDueDate: "2026-10-01T00:00:00.000Z",
      signatoryFullName: "Veli Adı",
      signatoryRelationship: "veli",
    });
    expect(contract.ok).toBe(true);
    if (!contract.ok) return;
    expect(contract.data.contract.totalContractAmount).toBe(0);
    expect(contract.data.installments).toHaveLength(0);
    expect(await paymentsOf(student.id)).toHaveLength(0);
  });

  it("kısmi indirimde 0 TL reddedilir — alan bazlı, anlaşılır mesaj", async () => {
    const fixture = await packageWithCampaign(50);
    const res = await createStudentTool(ctx(), { ...base, ...fixture, firstPaymentCollected: { amount: 0 } });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const details = res.error.details as { fieldErrors: Record<string, string[]> };
    expect(details.fieldErrors.firstPaymentAmount?.[0]).toMatch(/0 TL olamaz/);
    expect((await readData()).students.some((s) => s.name === base.name)).toBe(false);
  });

  it("tutar > 0 iken yöntem yoksa reddedilir (normal ücretli kayıt kuralı korunur)", async () => {
    const fixture = await packageWithCampaign(50);
    const res = await createStudentTool(ctx(), { ...base, ...fixture, firstPaymentCollected: { amount: 500, collectedAt: "2026-10-01" } });
    expect(res.ok).toBe(false);
  });

  it("normal ücretli kayıt: önerilen tutar tahsil edilir, 'paid' ödeme satırı yazılır", async () => {
    const pkg = await createPackageTool(ctx("SUPER_ADMIN"), { title: "Bireysel", price30Min: 2000, price40Min: 2500, price50Min: 3000 });
    if (!pkg.ok) throw new Error("fixture");
    // Ekim 2026 Salı: 6, 13, 20, 27 → 4 ders = tam aylık 2.500 TL.
    const res = await createStudentTool(ctx(), {
      ...base,
      packageId: pkg.data.packageId,
      firstCollectionIncludesNextMonth: false,
      firstPaymentCollected: { method: "cash", amount: 2500, collectedAt: "2026-10-01" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const rows = await paymentsOf(res.data.studentId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 2500, paidAmount: 2500, status: "paid" });
  });
});

describe("Ödeme Profili — kayıt motorunun 'percent' indirimi yüzde sayılır", () => {
  it("%100 → net 0 (eskiden ₺100 indirim, net 6.900 görünüyordu); %50 → yarısı; sabit tutar değişmez", async () => {
    const { computeStudentMonthlyAmount } = await import("../student-payment-profile");
    const pkg = { id: "p", title: "P", price30Min: 6000, price40Min: 7000, price50Min: 8000 } as never;
    expect(computeStudentMonthlyAmount({ discountType: "percent", discountValue: 100 }, pkg, 40).netAmount).toBe(0);
    expect(computeStudentMonthlyAmount({ discountType: "percent", discountValue: 50 }, pkg, 40).netAmount).toBe(3500);
    expect(computeStudentMonthlyAmount({ discountType: "percentage", discountValue: 10 }, pkg, 40).netAmount).toBe(6300);
    expect(computeStudentMonthlyAmount({ discountType: "fixed", discountValue: 100 }, pkg, 40).netAmount).toBe(6900);
  });
});
