/**
 * Satıcı (NeviiHub) şirket profili — faturalardaki satıcı kaydı.
 *
 * - Bu bilgiler SECRET DEĞİLDİR (ticaret unvanı, VKN, adres faturada
 *   görünür); ödeme/entegratör API sırlarından ayrı tutulur.
 * - Öncelik: kayıtlı profil ?? ortam değişkeni (SAAS_SELLER_*) ?? eksik.
 *   Kayıtlı profil serverless ortamda kalıcı değildir; kalıcı üretim
 *   değeri için ortam değişkeni gerekir (UI bunu açıkça söyler).
 * - Yeni belge snapshot'ları güncel profili dondurur; eski belge ve
 *   sipariş snapshot'ları DEĞİŞMEZ.
 */
import { z } from "zod";
import { fail, ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import { isValidTaxIdFormat, TAX_ID_FORMAT_ERROR } from "./invoicing-profile";
import type { SellerSnapshot } from "./invoicing-orders";

export type SellerProfileRecord = {
  legalTitle: string;
  taxId: string | null;
  taxOffice: string | null;
  addressLine: string | null;
  city: string | null;
  country: string;
  invoiceEmail: string;
  /** Sözleşme/ön bilgilendirme kimlik alanları (6563 s. Kanun; boşsa metinde "doldurulacak"). */
  mersisNo?: string | null;
  kepAddress?: string | null;
  phone?: string | null;
  updatedBy: string;
  updatedAt: string;
};

const inputSchema = z.object({
  legalTitle: z.string().trim().min(2).max(200),
  taxId: z.string().trim().max(20).nullable().optional(),
  taxOffice: z.string().trim().max(100).nullable().optional(),
  addressLine: z.string().trim().max(300).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
  invoiceEmail: z.string().trim().email().max(150),
  mersisNo: z.string().trim().max(20).nullable().optional(),
  kepAddress: z.string().trim().max(150).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

export type SellerFieldSource = "kayitli" | "env" | "eksik";

export async function getEffectiveSeller(): Promise<{
  snapshot: SellerSnapshot;
  sources: Record<string, SellerFieldSource>;
  stored: SellerProfileRecord | null;
}> {
  const env = (k: string) => (process.env[k] ?? "").trim() || null;
  const { getSellerProfile } = await import("./store");
  const stored = await getSellerProfile();
  const pick = (v: string | null, e: string | null) =>
    v?.trim() ? { value: v.trim(), source: "kayitli" as const } : e ? { value: e, source: "env" as const } : { value: null, source: "eksik" as const };
  const legalTitle = pick(stored?.legalTitle ?? null, env("SAAS_SELLER_LEGAL_TITLE"));
  const taxId = pick(stored?.taxId ?? null, env("SAAS_SELLER_TAX_ID"));
  const taxOffice = pick(stored?.taxOffice ?? null, env("SAAS_SELLER_TAX_OFFICE"));
  const addressLine = pick(stored?.addressLine ?? null, env("SAAS_SELLER_ADDRESS"));
  const city = pick(stored?.city ?? null, env("SAAS_SELLER_CITY"));
  const country = pick(stored?.country ?? null, env("SAAS_SELLER_COUNTRY"));
  const invoiceEmail = stored?.invoiceEmail?.trim() || "info@neviihub.com";
  return {
    snapshot: {
      legalTitle: legalTitle.value ?? "[DOĞRULANACAK: satıcı unvanı]",
      taxId: taxId.value,
      taxOffice: taxOffice.value,
      addressLine: addressLine.value,
      city: city.value,
      country: country.value ?? "Türkiye",
      invoiceEmail,
      verified: Boolean(legalTitle.value && taxId.value),
    },
    sources: {
      legalTitle: legalTitle.source,
      taxId: taxId.source,
      taxOffice: taxOffice.source,
      addressLine: addressLine.source,
      city: city.source,
      country: country.source,
      invoiceEmail: stored?.invoiceEmail?.trim() ? "kayitli" : "env",
    },
    stored,
  };
}

/** HYPER_ADMIN satıcı profili kaydı (validation + audit). Secret yazılmaz. */
export async function saveSellerProfile(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<SellerProfileRecord>> {
  if (ctx.role !== "HYPER_ADMIN") return fail("FORBIDDEN", "Bu alan yalnız platform yöneticisine açıktır.");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Satıcı bilgileri geçersiz.");
  }
  const v = parsed.data;
  const taxId = v.taxId?.trim() ? v.taxId.trim() : null;
  if (taxId && !isValidTaxIdFormat(taxId)) {
    return fail("VALIDATION_ERROR", TAX_ID_FORMAT_ERROR);
  }
  const now = new Date().toISOString();
  const record: SellerProfileRecord = {
    legalTitle: v.legalTitle.trim(),
    taxId,
    taxOffice: v.taxOffice?.trim() || null,
    addressLine: v.addressLine?.trim() || null,
    city: v.city?.trim() || null,
    country: v.country?.trim() || "Türkiye",
    invoiceEmail: v.invoiceEmail.trim().toLowerCase(),
    mersisNo: v.mersisNo?.trim() || null,
    kepAddress: v.kepAddress?.trim() || null,
    phone: v.phone?.trim() || null,
    updatedBy: ctx.userId,
    updatedAt: now,
  };
  const { saveSellerProfile: persist } = await import("./store");
  await persist(record);
  const { invalidatePublicSite } = await import("../platform/public-cache");
  invalidatePublicSite();
  const { appendPlatformAudit } = await import("../platform/store");
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: null,
    action: "saas.seller_profile.update",
    entityType: "seller_profile",
    entityId: "seller",
    before: null,
    after: { legalTitle: record.legalTitle, taxId: record.taxId ? "***" : null, updatedAt: now },
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
  return ok(record);
}
