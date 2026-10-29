/**
 * NeviiOS KDV oranı kararları (§8).
 *
 * TEK KAYNAK KURALI: yürürlükteki oran YALNIZCA env'den gelir
 * (`SAAS_TAX_RATE_BPS` + `SAAS_TAX_RATE_VERIFIED`) — bu modül ikinci bir
 * oran sistemi DEĞİLDİR. Buraya kaydedilen HER karar bir denetim kaydıdır
 * (oran + geçerlilik + gerekçe + kim/ne zaman); yürürlüğe girmesi için
 * env güncellemesi gerekir ve ekranda bu açıkça yazılır.
 *
 * Snapshot koruması: geçmiş ödeme/fatura/kabul snapshot'ları ASLA yeniden
 * hesaplanmaz; yeni oran yalnız yeni işlemlerde kullanılır.
 */
import { z } from "zod";
import type { ServiceContext } from "../services/context";
import { fail, ok, type ServiceResult } from "../services/result";
import { requireHyperAdmin } from "../platform/access";
import { listPolicyVersions } from "../platform/store-ext";
import { PLATFORM_SCOPE_ID, recordPublishedVersion } from "../platform/policy-version-log";
import { getTaxConfig } from "./tax";

export const SAAS_TAX_DECISION_KEY = "saas.tax.decision";

const DecisionInput = z.object({
  /** Baz puan (örn. 2000 = %20). Bilinmeyen oran 0/MUAF sayılmaz — boş bırakılamaz. */
  rateBps: z.number().int().min(1).max(10000),
  /** Geçerlilik başlangıcı (ISO tarih). */
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçerlilik tarihi GG.AA.YYYY biçiminde olmalı."),
  /** Gerekçe (mali müşavir notu vb.) — zorunlu. */
  reason: z.string().trim().min(8, "Gerekçe en az 8 karakter olmalı.").max(500),
});

export type TaxDecisionView = {
  version: number;
  status: string;
  rateBps: number;
  validFrom: string;
  reason: string;
  publishedBy: string;
  publishedAt: string;
};

export async function recordTaxDecision(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ version: number }>> {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const v = DecisionInput.safeParse(input);
  if (!v.success) {
    return fail("VALIDATION_ERROR", v.error.issues[0]?.message ?? "Geçersiz karar.");
  }
  const rec = await recordPublishedVersion(ctx, PLATFORM_SCOPE_ID, SAAS_TAX_DECISION_KEY, {
    rateBps: v.data.rateBps,
    validFrom: v.data.validFrom,
  } as unknown as import("../platform/types").JsonValue, { reason: v.data.reason });
  return ok({ version: rec.version });
}

export async function listTaxDecisions(ctx: ServiceContext): Promise<ServiceResult<TaxDecisionView[]>> {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const rows = await listPolicyVersions(PLATFORM_SCOPE_ID, SAAS_TAX_DECISION_KEY);
  return ok(
    rows.map((r) => {
      const val = (r.value ?? {}) as { rateBps?: number; validFrom?: string };
      return {
        version: r.version,
        status: r.status,
        rateBps: typeof val.rateBps === "number" ? val.rateBps : 0,
        validFrom: typeof val.validFrom === "string" ? val.validFrom : "",
        reason: r.reason,
        publishedBy: r.publishedBy ?? "",
        publishedAt: r.publishedAt ?? "",
      };
    })
  );
}

/** Ekranda gösterilen yürürlük özeti (tek kaynak: env). */
export function getEffectiveTaxSummary() {
  const t = getTaxConfig();
  return {
    rateBps: t.rateBps,
    rateLabel: `%${(t.rateBps / 100).toLocaleString("tr-TR")}`,
    verified: t.verified,
    demo: t.demo,
    source: "SAAS_TAX_RATE_BPS + SAAS_TAX_RATE_VERIFIED (env — tek kaynak)",
  };
}
