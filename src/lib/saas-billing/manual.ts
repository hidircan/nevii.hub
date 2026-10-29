/**
 * Kontrollü manuel mutabakat (F) — banka linki/transfer ile ödeme başlangıcı.
 *
 * - YALNIZCA yetkili platform yöneticisi onaylar (route HYPER_ADMIN).
 * - Ödeme referansı + tutar + para birimi + tarih + açıklama ZORUNLU.
 * - Linke tıklama / "ödedim" beyanı erişim AÇMAZ — yalnız bu onay açar.
 * - Dekont ödeme bilgisidir; yasal fatura gibi SUNULMAZ.
 * - Aynı referans tekrar işlenemez (idempotencyKey unique).
 * - Otomatik job ile yarış: dönem tek-success koruması geçerlidir.
 * - Manuel kanal müşteriye OTOMATİK kart aboneliği diye GÖSTERİLMEZ:
 *   aboneliğin sağlayıcısı "manual" olarak işaretlenir ve yürütme modeli
 *   yoktur (otomatik yenileme beklenmez — her dönem manuel onay gerekir).
 */
import { z } from "zod";
import { fail, ok, type ServiceResult } from "../services/result";
import { isSaasCurrency } from "./types";
import { getSaasSubscription, upsertSaasSubscription } from "./store";
import { applyCollectionSuccess } from "./collections";

const manualInputSchema = z.object({
  tenantId: z.string().min(1),
  /** Banka/dekont referansı (tekil). */
  providerRef: z.string().trim().min(3).max(80),
  /** Dekonttaki toplam (KDV DAHİL) — snapshot'taki toplamla eşleşmeli. */
  amountMinor: z.number().int().positive().optional(),
  /** TL girişi (₺, ondalıklı) — sunucu kuruşa çevirir; amountMinor ile ikisi birden verilemez. */
  amountTl: z.union([z.string(), z.number()]).optional(),
  currency: z.string().refine(isSaasCurrency, "Desteklenmeyen para birimi."),
  /** Paranın geçtiği tarih (ISO). */
  occurredAt: z.iso.datetime(),
  note: z.string().trim().min(5).max(300),
});

export async function approveManualPayment(args: {
  input: unknown;
  approvedBy: string;
  nowIso?: string;
}): Promise<ServiceResult<{ subscriptionId: string; paidThrough: string | null }>> {
  const parsed = manualInputSchema.safeParse(args.input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz manuel ödeme.");
  }
  const v = parsed.data;
  const now = args.nowIso ?? new Date().toISOString();
  const sub = await getSaasSubscription(v.tenantId);
  if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
  // TL girişi → kuruş dönüşümü SUNUCUDA (Math.round; virgül ondalık ayracı da kabul edilir).
  let amountMinor = v.amountMinor ?? null;
  if (v.amountTl !== undefined && v.amountTl !== null && String(v.amountTl).trim() !== "") {
    if (amountMinor !== null) return fail("VALIDATION_ERROR", "Tutar yalnız bir biçimde verilmeli.");
    const n = Number(String(v.amountTl).trim().replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return fail("VALIDATION_ERROR", "Geçersiz TL tutarı.");
    amountMinor = Math.round(n * 100);
  }
  if (amountMinor === null || amountMinor <= 0) return fail("VALIDATION_ERROR", "Tutar zorunlu.");

  const applied = await applyCollectionSuccess({
    tenantId: v.tenantId,
    amountMinor,
    currency: v.currency as import("./types").SaasCurrency,
    provider: "manual",
    merchantAccount: "manual",
    providerRef: v.providerRef,
    providerEventId: `manual_${v.providerRef}`,
    idempotencyKey: `manual_${v.providerRef}`,
    nowIso: now,
  });
  if (!applied.ok) return applied;
  if (applied.data.duplicate) {
    return fail("CONFLICT", "Bu ödeme referansı zaten işlendi.");
  }
  // Manuel kanal: otomatik yenileme beklenmez — sağlayıcı kaydı "manual",
  // yürütme modeli yok. Müşteri ekranı "manuel ödeme" olarak gösterir.
  const next = {
    ...applied.data.subscription,
    provider: "manual" as const,
    executionModel: null,
    merchantAccount: "manual",
    updatedAt: now,
  };
  await upsertSaasSubscription(next);
  void args.approvedBy;
  return ok({ subscriptionId: next.id, paidThrough: next.paidThrough });
}
