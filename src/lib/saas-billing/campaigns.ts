/**
 * Pilot kampanyalar — YALNIZ sunucu doğrular.
 *
 * - Public kupon YOK: `code` sunucu-içi referanstır, URL'ye konmaz, başka
 *   kurum aynı özel fiyata erişemez (tenantId bağı zorunlu).
 * - Ömür boyu indirim varsayılmaz: maxRenewals + validTo + postCampaignNote
 *   ile süre/yenileme sayısı ve sonrası fiyat her zaman bellidir.
 * - YENİLEME SAYIMI SÖZLEŞMESİ: ilk tahsilat (checkout) HER ZAMAN kampanyalıdır
 *   (checkout anında doğrulanır). maxRenewals = ilk tahsilattan SONRA kampanyalı
 *   çekilecek YENİLEME sayısıdır. Örnek: maxRenewals=3 → 1. tahsilat + 3 yenileme
 *   kampanyalı (toplam 4 indirimli tahsilat). Hak tükenince otomatik çekim DURUR;
 *   liste fiyatıyla devam operatör onayıyla ve yeni kabulle olur (sessiz geçiş
 *   YOK) — yenileme anında `validateRenewalCampaign` ile denetlenir.
 * - Sabit fiyat veya indirim; aylık/yıllık kapsam (intervalScope);
 *   kullanım sayısı (maxRedemptions/redeemedCount) ile sınırlı.
 */
import { z } from "zod";
import { uid } from "../utils";
import { fail, ok, type ServiceResult } from "../services/result";
import type { SaasBillingInterval, SaasCampaignRecord } from "./types";
import { applyFixedDiscount, applyPercentDiscount } from "./types";
import { getSaasCampaign, getSaasCampaignByCode, saveSaasCampaign } from "./store";

const campaignInputSchema = z.object({
  name: z.string().trim().min(3).max(80),
  tenantId: z.string().min(1, "Pilot kurum bağı zorunlu."),
  discountType: z.enum(["fixed_minor", "percent"]),
  amountMinor: z.number().int().min(0).nullable().optional(),
  /** TL girişi (₺) — sunucu kuruşa çevirir; amountMinor ile ikisi birden verilemez. */
  amountTl: z.union([z.string(), z.number()]).nullable().optional(),
  percent: z.number().int().min(1).max(100).nullable().optional(),
  intervalScope: z.enum(["monthly", "yearly", "both"]).default("both"),
  validFrom: z.iso.datetime().nullable().optional(),
  validTo: z.iso.datetime().nullable().optional(),
  maxRenewals: z.number().int().min(0).max(120).nullable().optional(),
  maxRedemptions: z.number().int().min(1).max(1000).nullable().optional(),
  postCampaignNote: z.string().trim().min(5).max(300),
});

export type CampaignValidation =
  | { ok: true; amountMinor: number; note: string }
  | { ok: false; error: string };

/** Kampanya oluşturur (HYPER_ADMIN). Kod sunucu-içi üretilir. */
export async function createPilotCampaign(args: {
  input: unknown;
  createdBy: string;
  nowIso?: string;
}): Promise<ServiceResult<SaasCampaignRecord>> {
  const parsed = campaignInputSchema.safeParse(args.input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz kampanya.");
  }
  const v = parsed.data;
  let amountMinor = v.amountMinor ?? null;
  if (v.amountTl !== null && v.amountTl !== undefined && String(v.amountTl).trim() !== "") {
    if (amountMinor !== null) return fail("VALIDATION_ERROR", "Tutar yalnız bir biçimde verilmeli.");
    const n = Number(String(v.amountTl).trim().replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return fail("VALIDATION_ERROR", "Geçersiz TL tutarı.");
    amountMinor = Math.round(n * 100);
  }
  if (v.discountType === "fixed_minor" && amountMinor === null) {
    return fail("VALIDATION_ERROR", "Sabit indirim tutarı zorunlu.");
  }
  if (v.discountType === "percent" && (v.percent === null || v.percent === undefined)) {
    return fail("VALIDATION_ERROR", "Yüzde indirim oranı zorunlu.");
  }
  const now = args.nowIso ?? new Date().toISOString();
  const record: SaasCampaignRecord = {
    id: uid("saas_cmp"),
    name: v.name,
    tenantId: v.tenantId,
    code: `pilot_${uid("c").replace(/^c_/, "")}`,
    discountType: v.discountType,
    amountMinor,
    percent: v.percent ?? null,
    intervalScope: v.intervalScope,
    validFrom: v.validFrom ?? null,
    validTo: v.validTo ?? null,
    maxRenewals: v.maxRenewals ?? null,
    maxRedemptions: v.maxRedemptions ?? null,
    redeemedCount: 0,
    postCampaignNote: v.postCampaignNote,
    active: true,
    createdBy: args.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  await saveSaasCampaign(record);
  return ok(record);
}

/**
 * Kampanyayı sunucuda doğrular ve indirimli tutarı hesaplar.
 * İstemcinin gönderdiği tutar/indirim GÜVENİLMEZ — yalnız bu sonuç kullanılır.
 */
export async function validateCampaignForTenant(args: {
  code: string;
  tenantId: string;
  interval: SaasBillingInterval;
  listAmountMinor: number;
  renewalsUsed: number;
  nowIso?: string;
}): Promise<CampaignValidation> {
  const c = await getSaasCampaignByCode(args.code);
  if (!c || !c.active) return { ok: false, error: "Kampanya bulunamadı veya pasif." };
  // Kurum bağı: başka kurum aynı özel fiyata erişemez.
  if (!c.tenantId || c.tenantId !== args.tenantId) {
    return { ok: false, error: "Bu kampanya kurumunuza tanımlı değil." };
  }
  if (c.intervalScope !== "both" && c.intervalScope !== args.interval) {
    return { ok: false, error: "Kampanya bu ödeme periyodunda geçerli değil." };
  }
  const nowMs = new Date(args.nowIso ?? new Date().toISOString()).getTime();
  if (c.validFrom && new Date(c.validFrom).getTime() > nowMs) {
    return { ok: false, error: "Kampanya henüz başlamadı." };
  }
  if (c.validTo && new Date(c.validTo).getTime() < nowMs) {
    return { ok: false, error: "Kampanya süresi doldu." };
  }
  if (c.maxRenewals !== null && args.renewalsUsed >= c.maxRenewals) {
    return { ok: false, error: "Kampanya yenileme hakkı doldu." };
  }
  if (c.maxRedemptions !== null && c.redeemedCount >= c.maxRedemptions) {
    return { ok: false, error: "Kampanya kullanım hakkı doldu." };
  }
  const amountMinor =
    c.discountType === "percent"
      ? applyPercentDiscount(args.listAmountMinor, c.percent ?? 0)
      : applyFixedDiscount(args.listAmountMinor, c.amountMinor ?? 0);
  return {
    ok: true,
    amountMinor,
    note: `${c.name}: ${c.postCampaignNote}`,
  };
}

/**
 * Yenileme anı kampanya denetimi: başarılı YENİLEME çekim sayısına göre
 * kampanya hâlâ geçerli mi? İlk tahsilat (checkout) bu sayıya DAHİL DEĞİL —
 * yalnızca scheduler'daki başarılı `charge` denemeleri sayılır.
 *
 * Geçersizse otomatik çekim YAPILMAZ; çağrıcı REVIEW kaydı açar (sessiz
 * liste-fiyat geçişi veya bayat indirimle çekim YOK).
 */
export async function validateRenewalCampaign(args: {
  code: string;
  tenantId: string;
  interval: SaasBillingInterval;
  listAmountMinor: number;
  succeededRenewals: number;
  nowIso?: string;
}): Promise<CampaignValidation> {
  return validateCampaignForTenant({
    code: args.code,
    tenantId: args.tenantId,
    interval: args.interval,
    listAmountMinor: args.listAmountMinor,
    renewalsUsed: args.succeededRenewals,
    nowIso: args.nowIso,
  });
}

/**
 * Ödeme takvimi açıklaması — davet/onay/abonelik ekranlarında AYNI metin.
 * Dönem adları göreli ("1. yıl", "2. ay") verilir; mutlak tarih uydurulmaz
 * (gerçek dönemler abonelik kaydından oluşur).
 */
export function describeCampaignSchedule(args: {
  maxRenewals: number | null;
  validTo: string | null;
}): { headline: string; lines: string[] } {
  const lines: string[] = [];
  lines.push(`1. tahsilat (bugün): kampanyalı.`);
  if (args.maxRenewals === null) {
    lines.push(
      `Sonraki yenilemeler kampanya aktif kaldıkça kampanyalı (süre sınırı varsa aşağıda).`
    );
  } else if (args.maxRenewals === 0) {
    lines.push(`Yenilemeler kampanyasızdır; sonraki dönem liste fiyatıyla ve onayınızla devam eder.`);
  } else {
    lines.push(
      `Sonraki ${args.maxRenewals} yenileme kampanyalı (toplam ${args.maxRenewals + 1} indirimli tahsilat).`
    );
    lines.push(
      `Hak bitince otomatik çekim durur; liste fiyatıyla devam için onayınız istenir.`
    );
  }
  if (args.validTo) {
    lines.push(
      `Kampanya bitişi: ${new Date(args.validTo).toLocaleDateString("tr-TR")}.`
    );
  }
  const headline =
    args.maxRenewals === null
      ? `İlk tahsilat ve aktif kaldıkça yenilemeler kampanyalı`
      : args.maxRenewals === 0
        ? `Yalnızca ilk tahsilat kampanyalı`
        : `İlk tahsilat dahil toplam ${args.maxRenewals + 1} tahsilat kampanyalı`;
  return { headline, lines };
}

/** Başarılı kullanım sonrası sayaç artırımı (idempotent değil — çağrıcı tek çağırır). */
export async function redeemCampaign(code: string): Promise<ServiceResult<SaasCampaignRecord>> {
  const c = await getSaasCampaignByCode(code);
  if (!c) return fail("NOT_FOUND", "Kampanya bulunamadı.");
  const next = { ...c, redeemedCount: c.redeemedCount + 1, updatedAt: new Date().toISOString() };
  await saveSaasCampaign(next);
  return ok(next);
}

export async function deactivateCampaign(id: string): Promise<ServiceResult<SaasCampaignRecord>> {
  const c = await getSaasCampaign(id);
  if (!c) return fail("NOT_FOUND", "Kampanya bulunamadı.");
  const next = { ...c, active: false, updatedAt: new Date().toISOString() };
  await saveSaasCampaign(next);
  return ok(next);
}
