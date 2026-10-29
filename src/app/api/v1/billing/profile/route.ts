import { withApiHandler } from "@/lib/api/handler";
import { fail, ok } from "@/lib/services/result";
import {
  buildBillingProfileRecord,
  maskTaxId,
  validateBillingProfile,
  type BillingProfileRecord,
} from "@/lib/saas-billing/invoicing-profile";
import { getBillingProfile, saveBillingProfile } from "@/lib/saas-billing/store";

export const dynamic = "force-dynamic";

function publicView(p: BillingProfileRecord) {
  // Kurum sahibinin KENDİ profili: tam görünüm (maskesiz) — düzenleme için gerekli.
  return p;
}

export function maskedView(p: BillingProfileRecord) {
  return {
    ...p,
    taxId: maskTaxId(p.taxId),
    nationalId: maskTaxId(p.nationalId),
  };
}

/**
 * GET /api/v1/billing/profile — kurumun fatura profili (yoksa null).
 * PUT /api/v1/billing/profile — oluştur/güncelle (sürüm + audit izli).
 * Yalnız kurumun KENDİ tenant'ı; SUPER_ADMIN yazar.
 */
export const GET = withApiHandler(
  async ({ ctx }) => {
    const p = await getBillingProfile(ctx.tenantId);
    return ok({ profile: p ? publicView(p) : null });
  },
  { permission: "billing:read" }
);

export const PUT = withApiHandler(
  async ({ ctx, body }) => {
    const v = validateBillingProfile(body);
    if (!v.ok) return fail("VALIDATION_ERROR", v.error);
    const prev = await getBillingProfile(ctx.tenantId);
    const rec = buildBillingProfileRecord({
      data: v.data,
      tenantId: ctx.tenantId,
      updatedBy: ctx.userId,
      prev,
    });
    await saveBillingProfile(rec);
    return ok({ profile: publicView(rec) });
  },
  { permission: "billing:write" }
);
