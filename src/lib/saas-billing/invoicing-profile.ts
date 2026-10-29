import { z } from "zod";
import { uid } from "../utils";

/**
 * Fatura profili — kurumun SaaS aboneliği için düzenlenecek belgelerdeki alıcı.
 *
 * Sınırlar:
 * - Biçim kontrolleri (VKN/TCKN basamak + TCKN algoritması) GERÇEK mükellef
 *   doğrulaması DEĞİLDİR; yalnız yazım hatasını yakalar.
 * - Kesin zorunluluk matrisi GİB/entegratör şemasıyla doğrulanmadı — bu dosya
 *   [DOĞRULANACAK] notları taşır; entegratör seçilince şemaya göre sıkılaşır.
 * - e-Fatura kayıtlılığı kullanıcı beyanı değil, entegratör sorgusuyla
 *   doğrulanır (entegratör yokken `null` = bilinmiyor).
 */

export const BILLING_RECIPIENT_TYPES = ["corporate", "sole_trader", "individual"] as const;
export type BillingRecipientType = (typeof BILLING_RECIPIENT_TYPES)[number];

export const BILLING_RECIPIENT_LABELS: Record<BillingRecipientType, string> = {
  corporate: "Tüzel kişi (şirket)",
  sole_trader: "Şahıs işletmesi",
  individual: "Bireysel",
};

export type BillingProfileRecord = {
  id: string;
  tenantId: string;
  /** Uygulamadaki kurum adı (görünen ad) — faturadaki unvandan ayrı tutulur. */
  displayName: string;
  recipientType: BillingRecipientType;
  /** Tüzel/şahıs: resmî ticaret unvanı. Bireysel: ad soyad. */
  legalTitle: string;
  /** VKN (10 hane) — tüzel kişi ve şahıs işletmesinde zorunlu. */
  taxId: string | null;
  /** TCKN (11 hane) — bireyselde ve gerektiğinde zorunlu. */
  nationalId: string | null;
  taxOffice: string | null;
  addressLine: string;
  district: string | null;
  city: string;
  country: string;
  invoiceEmail: string;
  contactName: string | null;
  contactPhone: string | null;
  /** Entegratörden doğrulanmış e-Fatura kayıtlılığı; null = bilinmiyor/beyan yok. */
  eInvoiceRegistered: boolean | null;
  eInvoiceRegisteredAt: string | null;
  eInvoiceAlias: string | null;
  version: number;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  audit: { at: string; by: string; action: "create" | "update"; note: string | null }[];
};

/** VKN: 10 basamak. [DOĞRULANACAK: GİB doğruluk algoritması entegratörle netleşecek.] */
export function isValidVknFormat(v: string): boolean {
  return /^\d{10}$/.test(v.trim());
}

/**
 * TCKN: 11 basamak + resmî basamak algoritması. Bu BİÇİM kontrolüdür;
 * MERNİS/mükellef doğrulaması yerine geçmez.
 */
export function isValidTcknFormat(v: string): boolean {
  const s = v.trim();
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  const d = s.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if ((odd * 7 - even) % 10 !== d[9]) return false;
  if (d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 !== d[10]) return false;
  return true;
}

const baseSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  recipientType: z.enum(BILLING_RECIPIENT_TYPES),
  legalTitle: z.string().trim().min(2).max(200),
  taxId: z.string().trim().max(20).nullable().optional(),
  nationalId: z.string().trim().max(20).nullable().optional(),
  taxOffice: z.string().trim().max(100).nullable().optional(),
  addressLine: z.string().trim().min(5).max(300),
  district: z.string().trim().max(100).nullable().optional(),
  city: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(100),
  invoiceEmail: z.string().trim().email().max(150),
  contactName: z.string().trim().max(120).nullable().optional(),
  contactPhone: z.string().trim().max(30).nullable().optional(),
});

export type BillingProfileInput = z.infer<typeof baseSchema>;

/**
 * Alıcı türüne göre koşullu zorunluluk. [DOĞRULANACAK: entegratör şeması
 * kesinleşince (örn. vergi dairesi zorunluluğu) bu matris güncellenecek.]
 */
export function validateBillingProfile(input: unknown):
  | { ok: true; data: BillingProfileInput }
  | { ok: false; error: string } {
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Fatura bilgileri geçersiz." };
  }
  const v = parsed.data;
  const taxId = v.taxId?.trim() ? v.taxId.trim() : null;
  const nationalId = v.nationalId?.trim() ? v.nationalId.trim() : null;
  if (v.recipientType === "corporate" || v.recipientType === "sole_trader") {
    if (!taxId) return { ok: false, error: "Vergi kimlik numarası (VKN) zorunludur." };
    if (!isValidVknFormat(taxId)) return { ok: false, error: "VKN 10 basamak sayı olmalıdır." };
    if (nationalId && !isValidTcknFormat(nationalId)) {
      return { ok: false, error: "T.C. kimlik numarası biçimi geçersiz." };
    }
  } else {
    if (!nationalId) {
      // Bireyselde TCKN yoksa VKN de kabul edilir (serbest meslek vb.).
      if (!taxId) return { ok: false, error: "T.C. kimlik numarası veya VKN zorunludur." };
      if (!isValidVknFormat(taxId)) return { ok: false, error: "VKN 10 basamak sayı olmalıdır." };
    } else if (!isValidTcknFormat(nationalId)) {
      return { ok: false, error: "T.C. kimlik numarası biçimi geçersiz." };
    }
  }
  return { ok: true, data: { ...v, taxId, nationalId } };
}

/**
 * Doğrulanmış girdiden profil kaydı kurar (oluşturma + güncelleme ortak).
 * Profil değişimi eski sipariş/belge snapshot'larını DEĞİŞTİRMEZ
 * (dondurulmuş kopya).
 */
export function buildBillingProfileRecord(args: {
  data: BillingProfileInput;
  tenantId: string;
  updatedBy: string;
  prev?: BillingProfileRecord | null;
  nowIso?: string;
}): BillingProfileRecord {
  const now = args.nowIso ?? new Date().toISOString();
  const prev = args.prev ?? null;
  const trim = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
  return {
    id: prev?.id ?? uid("saas_bprof"),
    tenantId: args.tenantId,
    displayName: args.data.displayName,
    recipientType: args.data.recipientType,
    legalTitle: args.data.legalTitle,
    taxId: args.data.taxId ?? null,
    nationalId: args.data.nationalId ?? null,
    taxOffice: trim(args.data.taxOffice),
    addressLine: args.data.addressLine,
    district: trim(args.data.district),
    city: args.data.city,
    country: args.data.country,
    invoiceEmail: args.data.invoiceEmail,
    contactName: trim(args.data.contactName),
    contactPhone: trim(args.data.contactPhone),
    eInvoiceRegistered: prev?.eInvoiceRegistered ?? null,
    eInvoiceRegisteredAt: prev?.eInvoiceRegisteredAt ?? null,
    eInvoiceAlias: prev?.eInvoiceAlias ?? null,
    version: (prev?.version ?? 0) + 1,
    updatedBy: args.updatedBy,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    audit: [
      ...(prev?.audit ?? []),
      { at: now, by: args.updatedBy, action: (prev ? "update" : "create") as "create" | "update", note: null },
    ].slice(-50),
  };
}

/** Liste/log maskesi — kimlik bilgisi açık yazılmaz. */
export function maskTaxId(v: string | null): string {
  if (!v) return "—";
  const s = v.trim();
  if (s.length <= 4) return "••••";
  return `${"•".repeat(Math.min(s.length - 4, 7))}${s.slice(-4)}`;
}
