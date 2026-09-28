import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createDiscountCampaignTool,
  createPackageTool,
  createStudentTool,
  updateDiscountCampaignTool,
  updatePackageTool,
} from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { computeMonthlyFee } from "../packages";
import {
  applicableCampaigns,
  buildCampaignReport,
  campaignLimitWarning,
  resolveCampaignStack,
} from "../discount-campaigns";
import { computePeriodAmount, derivePerLessonAmount } from "../period-lesson-billing";
import { buildContractPrefill, studentUsesPerLessonBilling } from "../contract-prefill";
import type { DiscountCampaign } from "../types";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}
const superCtx = () => ctx({ role: "SUPER_ADMIN" });

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  vi.clearAllMocks();
});

const PKG = { price30Min: 2000, price40Min: 2500, price50Min: 3000 };

const baseStudentInput = {
  name: "Motor Test Öğrenci",
  email: "",
  phone: "5551112233",
  parentName: "Veli Adı",
  parentPhone: "5559998877",
  branchId: "erzene",
  instrument: "Piyano",
  teacherId: "t1",
  packageName: "Bireysel Aylık — 4 ders",
  weeklyLessonCount: 2,
  monthlyFee: 1,
  notes: "",
  enrollmentStartDate: "2026-09-01",
};

async function createTestPackage(): Promise<string> {
  const res = await createPackageTool(superCtx(), {
    title: "Bireysel Piyano",
    price30Min: 2000,
    price40Min: 2500,
    price50Min: 3000,
  });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(res.error.message);
  return res.data.packageId;
}

function campaignFixture(over: Partial<DiscountCampaign> & { id: string; name: string }): DiscountCampaign {
  const now = new Date().toISOString();
  return {
    discountPercent: 10,
    kind: "sibling",
    active: true,
    stackingRule: "none",
    priority: 0,
    usageCount: 0,
    createdBy: "u1",
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

async function createTestCampaign(
  over: Record<string, unknown> = {}
): Promise<{ id: string }> {
  const res = await createDiscountCampaignTool(superCtx(), {
    name: "Test Kampanyası",
    kind: "sibling",
    discountPercent: 10,
    ...(over as { name?: string; kind?: "sibling"; discountPercent?: number }),
  });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(res.error.message);
  return { id: res.data.campaignId };
}

// ─── 1. Fiyat zinciri tutarlılığı: brüt → indirim → nihai → ders başı ───
describe("Paket & Kampanya Motoru — fiyat zinciri (%0/%50/%100)", () => {
  it.each([
    { percent: 0, final: 2500, derived: 313 },
    { percent: 50, final: 1250, derived: 156 },
    { percent: 100, final: 0, derived: 0 },
  ])("%$percent indirim → nihai $final TL, ders başı $derived TL", ({ percent, final, derived }) => {
    const r = computeMonthlyFee({ pkg: PKG, durationMinutes: 40, discountType: "percent", discountValue: percent });
    expect(r.baseMonthlyFee).toBe(2500);
    expect(r.finalMonthlyFee).toBe(final);
    // Ders başı HER ZAMAN nihai ücretten türetilir — brütten değil (Bug #1).
    expect(derivePerLessonAmount(r.finalMonthlyFee, 2)).toBe(derived);
    expect(derivePerLessonAmount(r.finalMonthlyFee, 2)).toBe(Math.round(final / 8));
  });

  it("tam ay değişmezi: referans ders adedinde dönem tutarı HER ZAMAN nihai ücrete eşit (0 dahil)", () => {
    for (const final of [2500, 1250, 0]) {
      expect(computePeriodAmount(final, 2, 8)).toBe(final);
    }
  });

  it("kısmi dönem %100 indirimde 0'dır, negatif olamaz", () => {
    expect(computePeriodAmount(0, 2, 3)).toBe(0);
    expect(computePeriodAmount(0, 2, 0)).toBe(0);
  });

  it("server: %100 manuel indirimli kayıt monthlyFee=0 + derivedPerLessonAmount=0 yazar (ekran dışı dahil)", async () => {
    const packageId = await createTestPackage();
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      packageId,
      lessonDurationMinutes: 40,
      discountType: "percent",
      discountValue: 100,
      // Önerilen ilk tahsilat 0 — fiilen 1 TL tahsilat + gerekçe (mevcut override yolu, ödeme motoru değişmedi).
      firstPaymentCollected: { method: "cash", amount: 1, collectedAt: "2026-09-01" },
      firstPaymentAdjustmentReason: "Test — %100 burslu, kayıt için sembolik tahsilat",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const student = (await readData()).students.find((s) => s.id === res.data.studentId)!;
    expect(student.monthlyFee).toBe(0);
    expect(student.packageBaseMonthlyFee).toBe(2500);
    expect(student.derivedPerLessonAmount).toBe(0);
    expect(student.discountType).toBe("percent");
    expect(student.discountValue).toBe(100);
  });
});

// ─── 2. Çakışma motoru ───
describe("Paket & Kampanya Motoru — resolveCampaignStack", () => {
  it("override en yüksek öncelikli tek başına kazanır, diğerlerini ezer", () => {
    const a = campaignFixture({ id: "a", name: "A", discountPercent: 50, stackingRule: "additive", priority: 99 });
    const b = campaignFixture({ id: "b", name: "B", discountPercent: 10, stackingRule: "override", priority: 1 });
    const r = resolveCampaignStack([a, b]);
    expect(r.applied.map((c) => c.id)).toEqual(["b"]);
    expect(r.effectivePercent).toBe(10);
    expect(r.excluded).toHaveLength(1);
  });

  it("birden fazla override varsa en yüksek öncelikli kazanır", () => {
    const a = campaignFixture({ id: "a", name: "A", discountPercent: 10, stackingRule: "override", priority: 1 });
    const b = campaignFixture({ id: "b", name: "B", discountPercent: 20, stackingRule: "override", priority: 5 });
    const r = resolveCampaignStack([a, b]);
    expect(r.applied.map((c) => c.id)).toEqual(["b"]);
    expect(r.effectivePercent).toBe(20);
  });

  it("none başka hiçbiriyle birleşemez; birden fazla none varsa en yüksek öncelikli kazanır", () => {
    const a = campaignFixture({ id: "a", name: "A", discountPercent: 30, stackingRule: "additive", priority: 99 });
    const n1 = campaignFixture({ id: "n1", name: "N1", discountPercent: 10, stackingRule: "none", priority: 1 });
    const n2 = campaignFixture({ id: "n2", name: "N2", discountPercent: 15, stackingRule: "none", priority: 7 });
    const r = resolveCampaignStack([a, n1, n2]);
    expect(r.applied.map((c) => c.id)).toEqual(["n2"]);
    expect(r.effectivePercent).toBe(15);
    expect(r.excluded).toHaveLength(2);
  });

  it("additive olanlar toplanır, toplam %100'ü geçemez", () => {
    const a = campaignFixture({ id: "a", name: "A", discountPercent: 60, stackingRule: "additive" });
    const b = campaignFixture({ id: "b", name: "B", discountPercent: 60, stackingRule: "additive" });
    const r = resolveCampaignStack([a, b]);
    expect(r.applied.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(r.effectivePercent).toBe(100);
  });

  it("yield başka aday varsa elenir, yalnızsa uygulanır", () => {
    const y = campaignFixture({ id: "y", name: "Y", discountPercent: 25, stackingRule: "yield" });
    expect(resolveCampaignStack([y]).applied.map((c) => c.id)).toEqual(["y"]);
    const a = campaignFixture({ id: "a", name: "A", discountPercent: 5, stackingRule: "additive" });
    const r = resolveCampaignStack([y, a]);
    expect(r.applied.map((c) => c.id)).toEqual(["a"]);
    expect(r.excluded.map((e) => e.campaign.id)).toEqual(["y"]);
  });

  it("boş girişte sonuç boş ve %0'dır", () => {
    expect(resolveCampaignStack([])).toEqual({ applied: [], excluded: [], effectivePercent: 0 });
  });
});

describe("Paket & Kampanya Motoru — uygulanabilirlik (aktif/tarih/şube)", () => {
  const base = campaignFixture({ id: "c", name: "C" });
  it("pasif kampanya aday olamaz", () => {
    expect(applicableCampaigns([{ ...base, active: false }], "erzene")).toHaveLength(0);
  });
  it("tarih penceresi dışı kampanya aday olamaz", () => {
    const future = { ...base, validFrom: "2999-01-01", validTo: "2999-12-31" };
    expect(applicableCampaigns([future], "erzene")).toHaveLength(0);
    const current = { ...base, validFrom: "2020-01-01", validTo: "2999-12-31" };
    expect(applicableCampaigns([current], "erzene")).toHaveLength(1);
  });
  it("şube kapsamı: boşsa tüm şubeler, doluysa yalnız listedekiler", () => {
    expect(applicableCampaigns([base], "erzene")).toHaveLength(1);
    expect(applicableCampaigns([{ ...base, branchId: "diger" }], "erzene")).toHaveLength(0);
    expect(applicableCampaigns([{ ...base, applicableBranchIds: ["erzene"] }], "erzene")).toHaveLength(1);
    expect(applicableCampaigns([{ ...base, applicableBranchIds: ["diger"] }], "erzene")).toHaveLength(0);
  });
  it("limit dolumu adaylığı ENGELLEMEZ (soft) — yalnız uyarı metni üretilir", () => {
    const limited = { ...base, maxUsageCount: 2, usageCount: 2 };
    expect(applicableCampaigns([limited], "erzene")).toHaveLength(1);
    expect(campaignLimitWarning(limited)).toContain("limiti doldu");
    expect(campaignLimitWarning({ ...base, usageCount: 5 })).toBeNull();
  });
});

// ─── 3. Kayıt entegrasyonu: paket + kampanya zinciri ───
describe("Paket & Kampanya Motoru — createStudentTool kampanya uygulaması", () => {
  it("tek kampanya: indirim uygulanır, appliedCampaignIds yazılır, sayaç artar", async () => {
    const packageId = await createTestPackage();
    const { id: campaignId } = await createTestCampaign({ name: "Erken Kayıt", discountPercent: 20 });
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      packageId,
      lessonDurationMinutes: 40,
      campaignIds: [campaignId],
      firstPaymentCollected: { method: "cash", amount: 2000, collectedAt: "2026-09-01" },
      firstPaymentAdjustmentReason: "Test — öneri/tahsilat farkı bu testin konusu değil",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const student = data.students.find((s) => s.id === res.data.studentId)!;
    expect(student.monthlyFee).toBe(2000);
    expect(student.discountType).toBe("percent");
    expect(student.discountValue).toBe(20);
    expect(student.appliedCampaignIds).toEqual([campaignId]);
    expect(student.derivedPerLessonAmount).toBe(derivePerLessonAmount(2000, 2));
    expect(data.discountCampaigns?.find((c) => c.id === campaignId)?.usageCount).toBe(1);
  });

  it("iki additive kampanya toplanır; none + additive'te none kazanır ve uyarı üretilir", async () => {
    const packageId = await createTestPackage();
    const mk = async (name: string, discountPercent: number, stackingRule: string) => {
      const r = await createDiscountCampaignTool(superCtx(), { name, kind: "sibling", discountPercent, stackingRule });
      if (!r.ok) throw new Error(r.error.message);
      return r.data.campaignId;
    };
    const a = await mk("A", 10, "additive");
    const b = await mk("B", 20, "additive");
    const first = await createStudentTool(ctx(), {
      ...baseStudentInput,
      name: "Toplam Öğrenci",
      phone: "5552223344",
      parentPhone: "5552223355",
      packageId,
      lessonDurationMinutes: 40,
      campaignIds: [a, b],
      firstPaymentCollected: { method: "cash", amount: 1750, collectedAt: "2026-09-01" },
      firstPaymentAdjustmentReason: "Test",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const s1 = (await readData()).students.find((s) => s.id === first.data.studentId)!;
    expect(s1.monthlyFee).toBe(1750);
    expect(s1.discountValue).toBe(30);

    const n = await mk("N", 10, "none");
    const second = await createStudentTool(ctx(), {
      ...baseStudentInput,
      name: "None Öğrenci",
      phone: "5553334455",
      parentPhone: "5553334466",
      packageId,
      lessonDurationMinutes: 40,
      campaignIds: [n, a],
      firstPaymentCollected: { method: "cash", amount: 2250, collectedAt: "2026-09-01" },
      firstPaymentAdjustmentReason: "Test",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const s2 = (await readData()).students.find((s) => s.id === second.data.studentId)!;
    expect(s2.monthlyFee).toBe(2250);
    expect(s2.appliedCampaignIds).toEqual([n]);
    expect(second.data.warnings?.join(" ")).toContain("uygulanmadı");
  });

  it("paketsiz (legacy) + kampanya: indirim serbest ücrete uygulanır, sayaç artar", async () => {
    const { id: campaignId } = await createTestCampaign({ name: "Legacy Kampanya", discountPercent: 25 });
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      monthlyFee: 4000,
      campaignIds: [campaignId],
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-09-01" },
      firstPaymentAdjustmentReason: "Test — öneri/tahsilat farkı bu testin konusu değil",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const student = data.students.find((s) => s.id === res.data.studentId)!;
    expect(student.packageId).toBeUndefined();
    expect(student.packageBaseMonthlyFee).toBe(4000);
    expect(student.monthlyFee).toBe(3000);
    expect(student.discountType).toBe("percent");
    expect(student.discountValue).toBe(25);
    expect(student.appliedCampaignIds).toEqual([campaignId]);
    expect(student.derivedPerLessonAmount).toBe(derivePerLessonAmount(3000, 2));
    expect(data.discountCampaigns?.find((c) => c.id === campaignId)?.usageCount).toBe(1);
  });

  it("paketsiz + iki additive kampanya toplanır; %100 tavan aşılmaz", async () => {
    const mk = async (name: string, discountPercent: number) => {
      const r = await createDiscountCampaignTool(superCtx(), {
        name,
        kind: "sibling",
        discountPercent,
        stackingRule: "additive",
      });
      if (!r.ok) throw new Error(r.error.message);
      return r.data.campaignId;
    };
    const a = await mk("LA", 60);
    const b = await mk("LB", 60);
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      monthlyFee: 4000,
      campaignIds: [a, b],
      firstPaymentCollected: { method: "cash", amount: 1, collectedAt: "2026-09-01" },
      firstPaymentAdjustmentReason: "Test",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const student = (await readData()).students.find((s) => s.id === res.data.studentId)!;
    expect(student.monthlyFee).toBe(0);
    expect(student.discountValue).toBe(100);
    expect(student.derivedPerLessonAmount).toBe(0);
  });

  it("paketsiz + kampanya + manuel indirim birlikte reddedilir", async () => {
    const { id: campaignId } = await createTestCampaign();
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      monthlyFee: 4000,
      campaignIds: [campaignId],
      discountType: "percent",
      discountValue: 5,
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-09-01" },
    });
    expect(res.ok).toBe(false);
  });

  it("kampanya + manuel indirim birlikte reddedilir (tek indirim kaynağı)", async () => {
    const packageId = await createTestPackage();
    const { id: campaignId } = await createTestCampaign();
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      packageId,
      lessonDurationMinutes: 40,
      campaignIds: [campaignId],
      discountType: "percent",
      discountValue: 5,
      firstPaymentCollected: { method: "cash", amount: 2000, collectedAt: "2026-09-01" },
    });
    expect(res.ok).toBe(false);
  });

  it("pasif/şube-dışı kampanya reddedilir", async () => {
    const packageId = await createTestPackage();
    const r = await createDiscountCampaignTool(superCtx(), {
      name: "Şube Dışı",
      kind: "sibling",
      discountPercent: 10,
      branchId: "diger-sube",
    });
    if (!r.ok) throw new Error(r.error.message);
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      packageId,
      lessonDurationMinutes: 40,
      campaignIds: [r.data.campaignId],
      firstPaymentCollected: { method: "cash", amount: 2250, collectedAt: "2026-09-01" },
    });
    expect(res.ok).toBe(false);
  });

  it("limiti dolmuş kampanya kaydı ENGELLEMEZ — soft uyarı döner", async () => {
    const packageId = await createTestPackage();
    const c = await createDiscountCampaignTool(superCtx(), {
      name: "Limitli",
      kind: "sibling",
      discountPercent: 10,
      maxUsageCount: 1,
    });
    if (!c.ok) throw new Error(c.error.message);
    const campaignId = c.data.campaignId;
    const payload = (phone: string, parentPhone: string) => ({
      ...baseStudentInput,
      phone,
      parentPhone,
      packageId,
      lessonDurationMinutes: 40,
      campaignIds: [campaignId],
      firstPaymentCollected: { method: "cash", amount: 2250, collectedAt: "2026-09-01" },
      firstPaymentAdjustmentReason: "Test",
    });
    const first = await createStudentTool(ctx(), { ...payload("5554445566", "5554445577"), name: "Limit 1" });
    expect(first.ok).toBe(true);
    const second = await createStudentTool(ctx(), { ...payload("5555556677", "5555556688"), name: "Limit 2" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.warnings?.join(" ")).toContain("limiti doldu");
    expect((await readData()).discountCampaigns?.find((x) => x.id === campaignId)?.usageCount).toBe(2);
  });
});

// ─── 4. Geriye dönük uyumluluk + okuyucular ───
describe("Paket & Kampanya Motoru — legacy kayıtlar ve okuyucular", () => {
  it("packageId'siz serbest-met-in kayıt aynen çalışır (kampanyasız, sayaçsız)", async () => {
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      monthlyFee: 4200,
      firstPaymentCollected: { method: "cash", amount: 4200, collectedAt: "2026-09-01" },
      firstPaymentAdjustmentReason: "Test — öneri/tahsilat farkı bu testin konusu değil",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const student = (await readData()).students.find((s) => s.id === res.data.studentId)!;
    expect(student.packageName).toBe("Bireysel Aylık — 4 ders");
    expect(student.packageId).toBeUndefined();
    expect(student.monthlyFee).toBe(4200);
    expect(student.packageBaseMonthlyFee).toBeUndefined();
    expect(student.appliedCampaignIds).toBeUndefined();
    expect(student.derivedPerLessonAmount).toBe(derivePerLessonAmount(4200, 2));
  });

  it("sözleşme ön-doldurma %100 indirimli kaydı tutarlı okur (0, çökme yok)", async () => {
    const packageId = await createTestPackage();
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      packageId,
      lessonDurationMinutes: 40,
      discountType: "percent",
      discountValue: 100,
      firstPaymentCollected: { method: "cash", amount: 1, collectedAt: "2026-09-01" },
      firstPaymentAdjustmentReason: "Test",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const student = (await readData()).students.find((s) => s.id === res.data.studentId)!;
    expect(studentUsesPerLessonBilling(student)).toBe(true);
    const prefill = buildContractPrefill({ student });
    expect(prefill.monthlyAmount).toBe(0);
  });
});

// ─── 5. RBAC: yazma yalnız SUPER_ADMIN ───
describe("Paket & Kampanya Motoru — RBAC (yazma yalnız SUPER_ADMIN)", () => {
  it("SCHOOL_ADMIN/TEACHER/STUDENT paket yazamaz, SUPER_ADMIN yazar", async () => {
    for (const role of ["SCHOOL_ADMIN", "TEACHER", "STUDENT"] as const) {
      const extra = role === "TEACHER" ? { teacherId: "t1" } : role === "STUDENT" ? { studentId: "s1" } : {};
      const denied = await createPackageTool(ctx({ role, ...extra }), {
        title: "X",
        price30Min: 1,
        price40Min: 1,
        price50Min: 1,
      });
      expect(denied.ok).toBe(false);
      if (!denied.ok) expect(denied.error.code).toBe("FORBIDDEN");
    }
    const allowed = await createPackageTool(superCtx(), { title: "Y", price30Min: 1, price40Min: 1, price50Min: 1 });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    const updDenied = await updatePackageTool(ctx(), { packageId: allowed.data.packageId, price30Min: 5 });
    expect(updDenied.ok).toBe(false);
    const updAllowed = await updatePackageTool(superCtx(), { packageId: allowed.data.packageId, price30Min: 5 });
    expect(updAllowed.ok).toBe(true);
  });

  it("SCHOOL_ADMIN/TEACHER kampanya yazamaz, SUPER_ADMIN yazar", async () => {
    const denied = await createDiscountCampaignTool(ctx(), { name: "X", kind: "sibling", discountPercent: 5 });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("FORBIDDEN");
    const allowed = await createDiscountCampaignTool(superCtx(), { name: "Y", kind: "sibling", discountPercent: 5 });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    const updDenied = await updateDiscountCampaignTool(ctx(), { campaignId: allowed.data.campaignId, active: false });
    expect(updDenied.ok).toBe(false);
    const updAllowed = await updateDiscountCampaignTool(superCtx(), {
      campaignId: allowed.data.campaignId,
      active: false,
    });
    expect(updAllowed.ok).toBe(true);
  });
});

// ─── 6. displayId: tenant-bazlı sıralı atama ───
describe("Paket & Kampanya Motoru — displayId", () => {
  it("paketler PKT-001'den, kampanyalar KMP-001'den sıralı gider (store yolu)", async () => {
    const mk = (title: string) =>
      createPackageTool(superCtx(), { title, price30Min: 1, price40Min: 1, price50Min: 1 });
    const p1 = await mk("P1");
    const p2 = await mk("P2");
    expect(p1.ok && p2.ok).toBe(true);
    const data = await readData();
    const ids = (data.packages ?? []).filter((p) => p.title === "P1" || p.title === "P2").map((p) => p.displayId);
    expect(ids).toEqual(["PKT-001", "PKT-002"]);
    const c1 = await createDiscountCampaignTool(superCtx(), { name: "K1", kind: "sibling", discountPercent: 5 });
    expect(c1.ok).toBe(true);
    const data2 = await readData();
    expect(data2.discountCampaigns?.find((c) => c.name === "K1")?.displayId).toBe("KMP-001");
  });

  it("istemci sınır regresyonu: saf fiyat/kampanya modülleri sunucu-only modül import etmez", async () => {
    // Kök neden (2026-09-28 build kırığı): packages.ts/discount-campaigns.ts
    // `entity-sequence` (Prisma/fs) import edince istemci paketi patladı.
    // displayId ataması store katmanında; bu dosyalar saf kalmalı.
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    for (const file of ["packages.ts", "discount-campaigns.ts"]) {
      const src = readFileSync(join(process.cwd(), "src", "lib", file), "utf8");
      expect(src).not.toMatch(/from\s+["']\.\/entity-sequence["']/);
      expect(src).not.toMatch(/from\s+["']\.\/db["']/);
    }
  });
});

// ─── 7. Kampanya raporu ───
describe("Paket & Kampanya Motoru — kampanya raporu", () => {
  it("hangi kampanyadan kimlerin faydalandığını detaylı listeler; kampanyasızlar listelenmez", async () => {
    const packageId = await createTestPackage();
    const mk = async (name: string, discountPercent: number) => {
      const r = await createDiscountCampaignTool(superCtx(), { name, kind: "sibling", discountPercent });
      if (!r.ok) throw new Error(r.error.message);
      return r.data.campaignId;
    };
    const k1 = await mk("Rapor K1", 20);
    const payload = (name: string, phone: string, parentPhone: string, campaignIds?: string[]) => ({
      ...baseStudentInput,
      name,
      phone,
      parentPhone,
      packageId,
      lessonDurationMinutes: 40,
      ...(campaignIds ? { campaignIds } : {}),
      firstPaymentCollected: { method: "cash", amount: 2000, collectedAt: "2026-09-01" },
      firstPaymentAdjustmentReason: "Test",
    });
    const r1 = await createStudentTool(ctx(), payload("Rapor A", "5556667788", "5556667799", [k1]));
    const r2 = await createStudentTool(ctx(), payload("Rapor B", "5557778899", "5557778800"));
    expect(r1.ok && r2.ok).toBe(true);
    const data = await readData();
    const report = buildCampaignReport(data.students, data.discountCampaigns ?? [], data.packages, () => "Erzene Şube");
    const entry = report.find((e) => e.campaign.id === k1)!;
    expect(entry.beneficiaries.map((b) => b.studentName)).toEqual(["Rapor A"]);
    expect(entry.beneficiaries[0]?.finalMonthlyFee).toBe(2000);
    expect(entry.beneficiaries[0]?.baseMonthlyFee).toBe(2500);
    expect(entry.totalDiscountAmount).toBe(500);
    // Kampanyasız öğrenci hiçbir girişte yok.
    expect(report.flatMap((e) => e.beneficiaries).some((b) => b.studentName === "Rapor B")).toBe(false);
    // Bilinmeyen kampanya id'si raporu bozmaz.
    const robust = buildCampaignReport(
      [{ ...data.students[0]!, appliedCampaignIds: ["yok-boyle-id"] }],
      data.discountCampaigns ?? [],
      data.packages,
      () => "X"
    );
    expect(robust).toEqual([]);
  });

  it("şube filtresi çalışır", async () => {
    const packageId = await createTestPackage();
    const k = await (async () => {
      const r = await createDiscountCampaignTool(superCtx(), { name: "F", kind: "sibling", discountPercent: 10 });
      if (!r.ok) throw new Error(r.error.message);
      return r.data.campaignId;
    })();
    const res = await createStudentTool(ctx(), {
      ...baseStudentInput,
      packageId,
      lessonDurationMinutes: 40,
      campaignIds: [k],
      firstPaymentCollected: { method: "cash", amount: 2250, collectedAt: "2026-09-01" },
      firstPaymentAdjustmentReason: "Test",
    });
    expect(res.ok).toBe(true);
    const data = await readData();
    const all = buildCampaignReport(data.students, data.discountCampaigns ?? [], data.packages, () => "B", {});
    expect(all[0]?.beneficiaries).toHaveLength(1);
    const filtered = buildCampaignReport(data.students, data.discountCampaigns ?? [], data.packages, () => "B", {
      branchId: "baska-sube",
    });
    expect(filtered).toEqual([]);
  });
});
