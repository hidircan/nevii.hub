import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  archiveDocumentInstanceTool,
  createDiscountCampaignTool,
  createDocumentInstanceTool,
  createPackageTool,
  createStudentTool,
  deleteDiscountCampaignTool,
  deleteDocumentInstanceTool,
  getDiscountCampaignDeletionImpactTool,
  getDocumentDeletionImpactTool,
  getDocumentInstanceTool,
  listDocumentInstancesTool,
  listDocumentTemplatesTool,
  updateDiscountCampaignTool,
  uploadSignedDocumentTool,
} from "../services/tools";
import { readData } from "../store";
import { isCampaignApplicable } from "../discount-campaigns";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { CRIT, TEST_CRITICAL_PASSWORD, withTestCriticalPassword } from "./helpers/critical-delete";

/**
 * 2026-09-29 owner kuralı — "Sil" = yetkili rol + kritik şifre + gerekçe, sunucuda.
 * Kampanya ve evrak silme SOFT DELETE'tir: geçmiş fiyat/yasal kayıt korunur.
 */
const audits: { action: string; outcome: string; meta?: Record<string, unknown> }[] = [];
vi.mock("../audit/log", () => ({
  recordAuditLog: vi.fn(async (input: { action: string; outcome: string; meta?: Record<string, unknown> }) => {
    audits.push({ action: input.action, outcome: input.outcome, meta: input.meta });
    return { id: "audit", persisted: true };
  }),
}));

const contractLink = vi.hoisted(() => ({ documentId: null as string | null }));
vi.mock("../contracts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../contracts")>();
  return {
    ...actual,
    findContractIdByDocumentInstanceId: vi.fn(async (_t: string, id: string) =>
      id === contractLink.documentId ? "contract_1" : null
    ),
  };
});

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const FILES = ["store.json", "document-templates.json", "document-instances.json"].map((f) => path.join(DIR, f));

function ctx(over: Partial<ServiceContext> = {}): ServiceContext {
  return { role: "SUPER_ADMIN", userId: "user_owner", tenantId: DEFAULT_TENANT_ID, channel: "web", ...over };
}

beforeEach(async () => {
  for (const f of FILES) await fs.rm(f, { force: true });
  audits.length = 0;
  contractLink.documentId = null;
  await withTestCriticalPassword();
});

function expectNoPasswordLeak() {
  expect(JSON.stringify(audits)).not.toContain(TEST_CRITICAL_PASSWORD);
}

// ─── Kampanya ───────────────────────────────────────────────────────────────

async function campaignWithStudent(percent = 100) {
  const pkg = await createPackageTool(ctx(), { title: "Bireysel", price30Min: 2000, price40Min: 2500, price50Min: 3000 });
  if (!pkg.ok) throw new Error(pkg.error.message);
  const c = await createDiscountCampaignTool(ctx(), { name: "Kardeş %100", kind: "sibling", discountPercent: percent });
  if (!c.ok) throw new Error(c.error.message);
  const st = await createStudentTool(ctx({ role: "SCHOOL_ADMIN" }), {
    name: "Kampanyalı Öğrenci",
    email: "",
    phone: "5551112233",
    parentName: "Veli",
    parentPhone: "5559998877",
    branchId: "erzene",
    instrument: "Piyano",
    teacherId: "t1",
    packageName: "Bireysel",
    packageId: pkg.data.packageId,
    lessonDurationMinutes: 40,
    weeklyLessonCount: 2,
    monthlyFee: 1,
    notes: "",
    enrollmentStartDate: "2026-09-01",
    campaignIds: [c.data.campaignId],
    firstPaymentCollected: { method: "cash", amount: 1, collectedAt: "2026-09-01" },
    firstPaymentAdjustmentReason: "Test — tahsilat farkı bu testin konusu değil",
  });
  if (!st.ok) throw new Error(st.error.message);
  const campaign = (await readData()).discountCampaigns!.find((x) => x.id === c.data.campaignId)!;
  return { campaign, studentId: st.data.studentId };
}

describe("Kampanya silme — soft delete + kritik şifre + gerekçe", () => {
  it("etki özeti bağlı öğrenciyi gösterir; silme geçmiş öğrenci ücretini (%100 → 0) değiştirmez, yeni kayıtta seçilemez", async () => {
    const { campaign, studentId } = await campaignWithStudent(100);
    const before = (await readData()).students.find((s) => s.id === studentId)!;
    expect(before.monthlyFee).toBe(0);
    expect(before.derivedPerLessonAmount).toBe(0);

    const impact = await getDiscountCampaignDeletionImpactTool(ctx(), { campaignId: campaign.id });
    expect(impact.ok && impact.data.studentCount).toBe(1);

    const del = await deleteDiscountCampaignTool(ctx(), {
      campaignId: campaign.id,
      confirmation: campaign.name,
      expectedUpdatedAt: campaign.updatedAt,
      ...CRIT,
    });
    expect(del.ok).toBe(true);

    const data = await readData();
    const after = data.discountCampaigns!.find((c) => c.id === campaign.id)!;
    expect(after.deletedAt).toBeTruthy();
    expect(after.deletionReason).toBe(CRIT.reason);
    expect(after.deletedByUserId).toBe("user_owner");
    expect(after.active).toBe(false);
    expect(after.usageCount).toBe(campaign.usageCount);
    expect(isCampaignApplicable(after, "erzene")).toBe(false);
    const student = data.students.find((s) => s.id === studentId)!;
    expect(student.monthlyFee).toBe(before.monthlyFee);
    expect(student.derivedPerLessonAmount).toBe(0);
    expect(student.appliedCampaignIds).toEqual([campaign.id]);
    expect(audits.some((a) => a.action === "discount_campaign.delete" && a.outcome === "success" && a.meta?.reason === CRIT.reason)).toBe(true);
    expectNoPasswordLeak();

    // Silinen kampanya yeniden etkinleştirilemez / düzenlenemez.
    const reactivate = await updateDiscountCampaignTool(ctx(), { campaignId: campaign.id, active: true });
    expect(reactivate.ok).toBe(false);
  });

  it("yanlış şifre, boş gerekçe, yanlış ad teyidi ve SCHOOL_ADMIN hiçbir şeyi değiştirmez", async () => {
    const { campaign } = await campaignWithStudent(20);
    const base = { campaignId: campaign.id, confirmation: campaign.name, expectedUpdatedAt: campaign.updatedAt };
    const attempts = [
      await deleteDiscountCampaignTool(ctx(), { ...base, criticalPassword: "yanlis-sifre", reason: "Yanlış kampanya" }),
      await deleteDiscountCampaignTool(ctx(), { ...base, ...CRIT, reason: "   " }),
      await deleteDiscountCampaignTool(ctx(), { ...base, ...CRIT, confirmation: "Başka ad" }),
      await deleteDiscountCampaignTool(ctx({ role: "SCHOOL_ADMIN" }), { ...base, ...CRIT }),
    ];
    for (const r of attempts) expect(r.ok).toBe(false);
    const after = (await readData()).discountCampaigns!.find((c) => c.id === campaign.id)!;
    expect(after.deletedAt).toBeUndefined();
    expect(after.active).toBe(true);
    expect(audits.some((a) => a.action === "discount_campaign.delete" && a.outcome === "denied" && a.meta?.reasonCode === "wrong_critical_password")).toBe(true);
    expectNoPasswordLeak();
  });

  it("eşzamanlı düzenleme (bayat updatedAt) reddedilir; çift gönderimde ikincisi işlem yapmaz; başka kurum ID'si bulunamaz", async () => {
    const { campaign } = await campaignWithStudent(20);
    const stale = await deleteDiscountCampaignTool(ctx(), {
      campaignId: campaign.id,
      confirmation: campaign.name,
      expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
      ...CRIT,
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("CONFLICT");

    const input = { campaignId: campaign.id, confirmation: campaign.name, expectedUpdatedAt: campaign.updatedAt, ...CRIT };
    const [a, b] = [await deleteDiscountCampaignTool(ctx(), input), await deleteDiscountCampaignTool(ctx(), input)];
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error.code).toBe("NOT_FOUND");

    const foreign = await deleteDiscountCampaignTool(ctx(), { ...input, campaignId: "camp_baska_kurum" });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe("NOT_FOUND");
  });
});

// ─── Evrak ──────────────────────────────────────────────────────────────────

const PDF = Buffer.from("%PDF-1.4 imzali").toString("base64");

async function seedDocument(opts: { signed?: boolean; archived?: boolean } = {}) {
  const t = await listDocumentTemplatesTool(ctx());
  if (!t.ok) throw new Error("templates");
  const created = await createDocumentInstanceTool(ctx(), { templateId: t.data.templates[0]!.id, fieldValues: {} });
  if (!created.ok) throw new Error(created.error.message);
  const documentId = created.data.documentId;
  if (opts.signed) {
    await uploadSignedDocumentTool(ctx(), { documentId, fileName: "imzali.pdf", fileMimeType: "application/pdf", fileData: PDF });
  }
  if (opts.archived) expect((await archiveDocumentInstanceTool(ctx(), { documentId })).ok).toBe(true);
  const doc = await getDocumentInstanceTool(ctx(), { documentId });
  if (!doc.ok) throw new Error("doc");
  return doc.data.document;
}

describe("Evrak silme — yalnız arşivlenmiş, soft delete, dosya korunur", () => {
  it("aktif evrak silinemez ve etki özeti önce arşivlemeyi söyler", async () => {
    const doc = await seedDocument();
    const impact = await getDocumentDeletionImpactTool(ctx(), { documentId: doc.id });
    expect(impact.ok && impact.data.allowed).toBe(false);
    expect(impact.ok && impact.data.blockReason).toContain("Arşivle");
    const del = await deleteDocumentInstanceTool(ctx(), { documentId: doc.id, confirmation: doc.reference, ...CRIT });
    expect(del.ok).toBe(false);
    expect((await getDocumentInstanceTool(ctx(), { documentId: doc.id })).ok).toBe(true);
  });

  it("arşivlenmiş imzalı evrak silinir: listeden/detaydan kalkar, satır ve dosya diskte kalır, audit yazılır", async () => {
    const doc = await seedDocument({ signed: true, archived: true });
    const del = await deleteDocumentInstanceTool(ctx({ role: "SCHOOL_ADMIN" }), {
      documentId: doc.id,
      confirmation: doc.reference,
      ...CRIT,
    });
    expect(del.ok).toBe(true);

    expect((await getDocumentInstanceTool(ctx(), { documentId: doc.id })).ok).toBe(false);
    const list = await listDocumentInstancesTool(ctx(), {});
    expect(list.ok && list.data.documents.some((d) => d.id === doc.id)).toBe(false);
    const cancelledList = await listDocumentInstancesTool(ctx(), { status: "cancelled" });
    expect(cancelledList.ok && cancelledList.data.documents.some((d) => d.id === doc.id)).toBe(false);

    const raw = JSON.parse(await fs.readFile(FILES[2]!, "utf8")) as { id: string; status: string; fileData?: string }[];
    const row = raw.find((r) => r.id === doc.id)!;
    expect(row.status).toBe("deleted");
    expect(row.fileData).toBe(PDF);

    // Silinen evrak arşivleme/yükleme yollarıyla geri canlanmaz.
    expect((await archiveDocumentInstanceTool(ctx(), { documentId: doc.id })).ok).toBe(false);
    expect(audits.some((a) => a.action === "document.delete" && a.outcome === "success" && a.meta?.reason === CRIT.reason)).toBe(true);
    expectNoPasswordLeak();

    const again = await deleteDocumentInstanceTool(ctx(), { documentId: doc.id, confirmation: doc.reference, ...CRIT });
    expect(again.ok).toBe(false);
  });

  it("sözleşmeye bağlı evrak arşivli olsa da silinemez", async () => {
    const doc = await seedDocument({ archived: true });
    contractLink.documentId = doc.id;
    const impact = await getDocumentDeletionImpactTool(ctx(), { documentId: doc.id });
    expect(impact.ok && impact.data.allowed).toBe(false);
    const del = await deleteDocumentInstanceTool(ctx(), { documentId: doc.id, confirmation: doc.reference, ...CRIT });
    expect(del.ok).toBe(false);
    expect((await getDocumentInstanceTool(ctx(), { documentId: doc.id })).ok).toBe(true);
  });

  it("yanlış şifre, boş gerekçe, şube müdürü ve başka kurum kimliği hiçbir şeyi silmez", async () => {
    const doc = await seedDocument({ archived: true });
    const base = { documentId: doc.id, confirmation: doc.reference };
    const attempts = [
      await deleteDocumentInstanceTool(ctx(), { ...base, criticalPassword: "yanlis", reason: "Mükerrer evrak" }),
      await deleteDocumentInstanceTool(ctx(), { ...base, ...CRIT, reason: "" }),
      await deleteDocumentInstanceTool(ctx({ role: "BRANCH_MANAGER" }), { ...base, ...CRIT }),
      await deleteDocumentInstanceTool(ctx({ tenantId: "tenant_baska" }), { ...base, ...CRIT }),
    ];
    for (const r of attempts) expect(r.ok).toBe(false);
    expect((await getDocumentInstanceTool(ctx(), { documentId: doc.id })).ok).toBe(true);
    expectNoPasswordLeak();
  });
});
