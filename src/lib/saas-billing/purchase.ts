/**
 * Yeni müşteri satın alma başvurusu (checkout "Hesap" adımı).
 *
 * - Tenant AÇMAZ, kart İSTEMEZ, ödeme BAŞLATMAZ.
 * - Onay sonrası mevcut güvenli davet akışıyla (kurum sahibi daveti →
 *   tenant açılışı → giriş) satın almaya devam edilir; seçim (plan/periyot)
 *   davet bağlantısında korunur.
 * - Fiyat dondurulmaz — snapshot ödeme öncesi checkout'ta, güncel yayından kurulur.
 * - Spam/abuse: route'ta IP rate-limit + e-posta başına tek bekleyen başvuru.
 */
import { z } from "zod";
import { uid } from "../utils";
import { fail, ok, type ServiceResult } from "../services/result";
import { getPublishedCatalog } from "../platform/commercial-catalog";
import type { SaasPurchaseRequestRecord } from "./types";

const purchaseRequestSchema = z.object({
  planKey: z.string().trim().min(1).max(64),
  interval: z.enum(["monthly", "yearly"]),
  institutionName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.email().max(160),
  ownerPhone: z.string().trim().max(20).nullable().optional(),
});

export async function submitPurchaseRequest(args: {
  input: unknown;
  nowIso?: string;
}): Promise<ServiceResult<SaasPurchaseRequestRecord>> {
  const parsed = purchaseRequestSchema.safeParse(args.input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz başvuru.");
  }
  const v = parsed.data;
  // Seçim yayında mı? (Fiyat snapshot KURULMAZ — yalnız plan/periyot geçerliliği.)
  const { catalog } = await getPublishedCatalog();
  const plan = catalog.plans.find((p) => p.key === v.planKey && p.status === "active" && !p.legacy);
  if (!plan) return fail("NOT_FOUND", "Seçilen paket yayında değil.");
  const now = args.nowIso ?? new Date().toISOString();
  const { listSaasPurchaseRequests, saveSaasPurchaseRequest } = await import("./store");
  const recent = await listSaasPurchaseRequests(200);
  const dup = recent.find(
    (r) => r.ownerEmail.toLowerCase() === v.ownerEmail.toLowerCase() && r.status === "pending"
  );
  if (dup) {
    return fail("VALIDATION_ERROR", "Bu e-posta ile zaten bekleyen bir başvuru bulunuyor.");
  }
  const record: SaasPurchaseRequestRecord = {
    id: uid("saas_pr"),
    planKey: plan.key,
    interval: v.interval,
    institutionName: v.institutionName,
    ownerName: v.ownerName,
    ownerEmail: v.ownerEmail.toLowerCase(),
    ownerPhone: v.ownerPhone?.trim() || null,
    status: "pending",
    tenantId: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: now,
  };
  await saveSaasPurchaseRequest(record);
  const { notifyOwnerNewRequest } = await import("./request-notify");
  await notifyOwnerNewRequest({ kind: "satin-alma", id: record.id, institutionName: record.institutionName, createdAt: now });
  return ok(record);
}

/** Başvuru kararı (HYPER_ADMIN). Onay = davet yolu açılır; ödeme/tenant OTOMATİK açılmaz. */
export async function decidePurchaseRequest(args: {
  requestId: string;
  approve: boolean;
  tenantId?: string;
  decidedBy: string;
  nowIso?: string;
}): Promise<ServiceResult<SaasPurchaseRequestRecord>> {
  const { getSaasPurchaseRequest, saveSaasPurchaseRequest } = await import("./store");
  const r = await getSaasPurchaseRequest(args.requestId);
  if (!r) return fail("NOT_FOUND", "Başvuru bulunamadı.");
  if (r.status !== "pending") return fail("VALIDATION_ERROR", "Başvuru zaten değerlendirildi.");
  const now = args.nowIso ?? new Date().toISOString();
  const next = {
    ...r,
    status: (args.approve ? "approved" : "rejected") as SaasPurchaseRequestRecord["status"],
    tenantId: args.tenantId ?? null,
    decidedBy: args.decidedBy,
    decidedAt: now,
  };
  await saveSaasPurchaseRequest(next);
  return ok(next);
}
