import { fail, ok } from "../services/result";
import type { ServiceResult } from "../services/result";
import { uid } from "../utils";
import type { BillingProfileRecord } from "./invoicing-profile";
import type { SaasCollectionAttemptRecord, SaasCurrency, SaasPriceSnapshot } from "./types";
import {
  getBillingProfile,
  getEDocumentByOrder,
  getInvoiceOrderByAttempt,
  saveEDocument,
  saveInvoiceOrder,
} from "./store";

/**
 * Sipariş snapshot + e-belge durum makinesi (NeviiHub SaaS satışı).
 *
 * - Her DOĞRULANMIŞ tahsilat (succeeded attempt) için EN FAZLA BİR sipariş
 *   kaydı: `attemptId` tekilliğiyle duplicate webhook ikinci belge üretmez.
 * - Sipariş, alıcı + satıcı + tutar snapshot'ını DONDURUR: profil sonradan
 *   değişse eski kayıt değişmez.
 * - Belge gövdesi (PDF/XML/base64) SATIRDA TUTULMAZ; yalnız sağlayıcı
 *   referansı/metadata + güvenli erişim bilgisi.
 * - Ödeme dekontu ≠ resmî fatura: `demo_preview` ve `receipt_only` türleri
 *   ASLA "fatura düzenlendi" diye sunulmaz.
 */

/** Satıcı (NeviiHub) snapshot'ı — bilinmeyen alanlar [DOĞRULANACAK]. */
export type SellerSnapshot = {
  legalTitle: string;
  taxId: string | null;
  taxOffice: string | null;
  addressLine: string | null;
  city: string | null;
  country: string;
  invoiceEmail: string;
  verified: boolean;
};

/**
 * Belgeye dondurulan satıcı kaydı: kayıtlı profil ?? env (SAAS_SELLER_*)
 * ?? eksik. Eski siparişlerin dondurulmuş satıcısı değişmez.
 */
export async function getSellerSnapshot(): Promise<SellerSnapshot> {
  const { getEffectiveSeller } = await import("./seller-profile");
  return (await getEffectiveSeller()).snapshot;
}

export type InvoiceOrderStatus = "awaiting_document" | "document_ready" | "document_failed" | "manual_pending";

export type InvoiceOrderRecord = {
  id: string;
  tenantId: string;
  subscriptionId: string;
  /** Doğrulanmış tahsilat denemesi — siparişin TEKİL anahtarı. */
  attemptId: string;
  providerRef: string | null;
  periodStart: string;
  periodEnd: string;
  /** Dondurulmuş alıcı (profil kopyası). */
  buyer: BillingProfileRecord;
  /** Dondurulmuş satıcı. */
  seller: SellerSnapshot;
  planKey: string;
  planLabel: string;
  billingInterval: string;
  currency: SaasCurrency;
  exclMinor: number;
  taxRateBps: number | null;
  taxMinor: number | null;
  totalMinor: number;
  taxDemo: boolean;
  campaignCode: string | null;
  priceSnapshotId: string;
  status: InvoiceOrderStatus;
  createdAt: string;
  updatedAt: string;
};

export type EDocumentKind = "e_invoice" | "e_archive" | "demo_preview" | "receipt_only";
export type EDocumentStatus =
  | "awaiting"
  | "processing"
  | "issued"
  | "transmission_pending"
  | "transmitted"
  | "manual_pending"
  | "failed";
export type EDocEmailStatus = "pending" | "sent" | "failed" | "skipped";

export type EDocumentRecord = {
  id: string;
  orderId: string;
  tenantId: string;
  kind: EDocumentKind;
  /** e-belge sağlayıcısı: "manual" = elle düzenleme; "demo" = demo önizleme. */
  provider: string;
  providerRef: string | null;
  /** Gerçek ETTN — demo/manual kayıtlarda null (tahsis edilmiş gibi davranılmaz). */
  ettn: string | null;
  documentNo: string | null;
  status: EDocumentStatus;
  transmissionStatus: string | null;
  emailStatus: EDocEmailStatus;
  emailError: string | null;
  error: string | null;
  retryCount: number;
  /** Son durum sorgusu (timeout sonrası kör yeniden-oluşturma YOK). */
  lastQueriedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EDocCapabilities = {
  issueEInvoice: boolean;
  issueEArchive: boolean;
  queryStatus: boolean;
  verifyRegistration: boolean;
};

export type EDocIssueResult =
  | { ok: true; providerRef: string; ettn: string | null; documentNo: string | null; statusNote: string }
  | { ok: false; error: string; retryable: boolean };

/** Sağlayıcıdan bağımsız e-belge sınırı — gerçek entegratör bu arayüzü uygular. */
export interface EDocumentProvider {
  readonly id: string;
  capabilities(): EDocCapabilities;
  issue(order: InvoiceOrderRecord, kind: EDocumentKind): Promise<EDocIssueResult>;
  query(providerRef: string): Promise<
    { found: boolean; issued: boolean; ettn: string | null; documentNo: string | null; note: string }
  >;
  verifyRegistration(_taxId: string): Promise<{ registered: boolean | null; alias: string | null; note: string }>;
}

/**
 * Manuel adapter — HER ZAMAN: entegratör yokken belge "manuel düzenleme
 * bekliyor" durumuna düşer; otomasyon çalışıyor gibi GÖSTERİLMEZ.
 */
export const manualEDocumentProvider: EDocumentProvider = {
  id: "manual",
  capabilities: () => ({ issueEInvoice: false, issueEArchive: false, queryStatus: false, verifyRegistration: false }),
  async issue() {
    return { ok: false, error: "Entegratör bağlı değil; belge manuel düzenlenmeli.", retryable: false };
  },
  async query() {
    return { found: false, issued: false, ettn: null, documentNo: null, note: "Sorgulanabilir sağlayıcı yok." };
  },
  async verifyRegistration() {
    return { registered: null, alias: null, note: "Entegratör yok; kayıtlılık bilinmiyor." };
  },
};

/**
 * Demo adapter — YALNIZ non-production + mock sağlayıcı. Gerçek ETTN/belge
 * numarası ÜRETMEZ; önizleme "DEMO — MALİ BELGE DEĞİLDİR" filigranlıdır.
 */
export const demoEDocumentProvider: EDocumentProvider = {
  id: "demo",
  capabilities: () => ({ issueEInvoice: false, issueEArchive: false, queryStatus: true, verifyRegistration: false }),
  async issue(order, kind) {
    if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
      return { ok: false, error: "Demo belge production'da üretilemez.", retryable: false };
    }
    if (process.env.SAAS_BILLING_PROVIDER !== "mock") {
      return { ok: false, error: "Demo belge yalnız mock sağlayıcıda üretilir.", retryable: false };
    }
    if (kind !== "demo_preview") {
      return { ok: false, error: "Demo adapter yalnız önizleme üretir.", retryable: false };
    }
    return {
      ok: true,
      providerRef: `demo_${order.id}`,
      ettn: null,
      documentNo: null,
      statusNote: "DEMO önizleme hazır (mali belge değildir).",
    };
  },
  async query(providerRef) {
    const issued = providerRef.startsWith("demo_");
    return {
      found: issued,
      issued,
      ettn: null,
      documentNo: null,
      note: issued ? "Demo önizleme kaydı." : "Kayıt bulunamadı.",
    };
  },
  async verifyRegistration() {
    return { registered: null, alias: null, note: "Demo modda kayıtlılık sorgulanmaz." };
  },
};

export function resolveEDocumentProvider(): EDocumentProvider {
  // Gerçek entegratör bağlanınca seçim buraya eklenir; bugün: demo veya manuel.
  if (
    process.env.VERCEL_ENV !== "production" &&
    process.env.NODE_ENV !== "production" &&
    process.env.SAAS_BILLING_PROVIDER === "mock"
  ) {
    return demoEDocumentProvider;
  }
  return manualEDocumentProvider;
}

function freezeProfile(p: BillingProfileRecord): BillingProfileRecord {
  return JSON.parse(JSON.stringify(p)) as BillingProfileRecord;
}

/**
 * Doğrulanmış tahsilat → sipariş kaydı (idempotent: attempt başına tek).
 * Profil yoksa sipariş YARIM bırakılmaz — profil eksikliği açık hatadır
 * (checkout'ta profil zorunlu olacağı için bu yol istisnadır).
 */
export async function ensureInvoiceOrderForAttempt(args: {
  attempt: SaasCollectionAttemptRecord;
  subscriptionId: string;
  tenantId: string;
  priceSnapshot: SaasPriceSnapshot;
  planLabel: string;
  nowIso?: string;
}): Promise<ServiceResult<{ order: InvoiceOrderRecord; created: boolean }>> {
  const { attempt } = args;
  if (attempt.status !== "succeeded") {
    return fail("VALIDATION_ERROR", "Yalnız doğrulanmış tahsilat için sipariş oluşur.");
  }
  const existing = await getInvoiceOrderByAttempt(attempt.id);
  if (existing) return ok({ order: existing, created: false });

  const profile = await getBillingProfile(args.tenantId);
  if (!profile) {
    return fail("VALIDATION_ERROR", "Fatura profili eksik; önce Fatura Bilgilerim tamamlanmalı.");
  }
  const snap = args.priceSnapshot;
  const now = args.nowIso ?? new Date().toISOString();
  const order: InvoiceOrderRecord = {
    id: uid("saas_ord"),
    tenantId: args.tenantId,
    subscriptionId: args.subscriptionId,
    attemptId: attempt.id,
    providerRef: attempt.providerRef,
    periodStart: attempt.periodStart,
    periodEnd: attempt.periodEnd,
    buyer: freezeProfile(profile),
    seller: await getSellerSnapshot(),
    planKey: snap.planKey,
    planLabel: args.planLabel,
    billingInterval: snap.billingInterval,
    currency: attempt.currency,
    exclMinor: snap.amountMinor,
    taxRateBps: snap.taxRateBps ?? null,
    taxMinor: snap.taxAmountMinor ?? null,
    totalMinor: snap.totalWithTaxMinor ?? snap.amountMinor,
    taxDemo: snap.taxDemo ?? false,
    campaignCode: snap.campaignCode,
    priceSnapshotId: `${args.subscriptionId}:${snap.acceptedAt}`,
    status: "awaiting_document",
    createdAt: now,
    updatedAt: now,
  };
  await saveInvoiceOrder(order);
  return ok({ order, created: true });
}

/**
 * Belge talebi — sipariş başına TEK belge kaydı. Timeout/belirsizlikte önce
 * `query` çalışır; körlemesine ikinci belge AÇILMAZ.
 */
export async function requestDocument(
  orderId: string,
  nowIso?: string
): Promise<ServiceResult<{ doc: EDocumentRecord; created: boolean }>> {
  const now = nowIso ?? new Date().toISOString();
  const existing = await getEDocumentByOrder(orderId);
  if (existing) {
    // processing belirsizliği: sağlayıcıda sorgula, kaydı güncelle.
    if (existing.status === "processing" && existing.providerRef) {
      const provider = resolveEDocumentProvider();
      if (provider.capabilities().queryStatus) {
        const q = await provider.query(existing.providerRef);
        existing.lastQueriedAt = now;
        existing.updatedAt = now;
        if (q.issued) {
          existing.status = "issued";
          existing.error = null;
          await saveEDocument(existing);
          return ok({ doc: existing, created: false });
        }
        await saveEDocument(existing);
        return ok({ doc: existing, created: false });
      }
    }
    return ok({ doc: existing, created: false });
  }
  // Siparişin varlığı ve tenant bağı doğrulanır (idari karışma yok).
  const { getInvoiceOrder } = await import("./store");
  const order = await getInvoiceOrder(orderId);
  if (!order) return fail("NOT_FOUND", "Sipariş bulunamadı.");

  const provider = resolveEDocumentProvider();
  const isDemo = provider.id === "demo";
  const doc: EDocumentRecord = {
    id: uid("saas_doc"),
    orderId: order.id,
    tenantId: order.tenantId,
    kind: isDemo ? "demo_preview" : "e_archive",
    provider: provider.id,
    providerRef: null,
    ettn: null,
    documentNo: null,
    status: "processing",
    transmissionStatus: null,
    emailStatus: "pending",
    emailError: null,
    error: null,
    retryCount: 0,
    lastQueriedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await saveEDocument(doc);

  // Manuel yolda "issue" her zaman manual_pending'e düşer (dürüst durum).
  if (!isDemo) {
    doc.status = "manual_pending";
    doc.error = "Entegratör bağlı değil; GİB/entegratör üzerinden manuel düzenleme bekleniyor.";
    doc.updatedAt = new Date().toISOString();
    await saveEDocument(doc);
    order.status = "manual_pending";
    order.updatedAt = doc.updatedAt;
    await saveInvoiceOrder(order);
    return ok({ doc, created: true });
  }
  const res = await provider.issue(order, doc.kind);
  doc.updatedAt = new Date().toISOString();
  if (!res.ok) {
    doc.status = "failed";
    doc.error = res.error;
    await saveEDocument(doc);
    order.status = "document_failed";
    order.updatedAt = doc.updatedAt;
    await saveInvoiceOrder(order);
    return fail("INTERNAL_ERROR", res.error);
  }
  doc.providerRef = res.providerRef;
  doc.status = "issued";
  doc.updatedAt = new Date().toISOString();
  await saveEDocument(doc);
  order.status = "document_ready";
  order.updatedAt = doc.updatedAt;
  await saveInvoiceOrder(order);
  return ok({ doc, created: true });
}

/** Güvenli retry — yalnız failed/manual_pending + deneme sınırı; e-posta ASLA yeniden kesmez. */
export async function retryDocument(docId: string): Promise<ServiceResult<{ doc: EDocumentRecord }>> {
  const { getEDocument } = await import("./store");
  const doc = await getEDocument(docId);
  if (!doc) return fail("NOT_FOUND", "Belge bulunamadı.");
  if (doc.status !== "failed" && doc.status !== "manual_pending") {
    return fail("VALIDATION_ERROR", "Yalnız başarısız veya manuel bekleyen belge yeniden denenir.");
  }
  if (doc.retryCount >= 5) return fail("VALIDATION_ERROR", "Deneme sınırı aşıldı (5).");
  if (doc.provider === "demo" && doc.kind === "demo_preview") {
    // Demo önizleme deterministiktir; retry aynı sonucu verir.
    doc.retryCount += 1;
    doc.status = "issued";
    doc.error = null;
    doc.updatedAt = new Date().toISOString();
    await saveEDocument(doc);
    return ok({ doc });
  }
  doc.retryCount += 1;
  doc.status = "manual_pending";
  doc.error = "Entegratör bağlı değil; manuel düzenleme bekleniyor.";
  doc.updatedAt = new Date().toISOString();
  await saveEDocument(doc);
  return ok({ doc });
}

export const E_DOC_STATUS_LABELS: Record<EDocumentStatus, string> = {
  awaiting: "Düzenleme bekliyor",
  processing: "İşleniyor",
  issued: "Düzenlendi",
  transmission_pending: "Resmî iletim bekliyor",
  transmitted: "Resmî iletim tamamlandı",
  manual_pending: "Manuel düzenleme bekliyor",
  failed: "Düzenlenemedi",
};

export const E_DOC_KIND_LABELS: Record<EDocumentKind, string> = {
  e_invoice: "e-Fatura",
  e_archive: "e-Arşiv",
  demo_preview: "Demo önizleme (mali belge değildir)",
  receipt_only: "Ödeme dekontu (fatura değildir)",
};
