import { withApiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/services/result";
import { getEffectiveSeller, saveSellerProfile } from "@/lib/saas-billing/seller-profile";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/v1/platform/billing/seller-profile (HYPER_ADMIN).
 * Satıcı şirket profili (secret DEĞİL — faturada görünen bilgiler).
 * Ödeme/entegratör sırları bu uca yazılamaz.
 */
export const GET = withApiHandler(
  async () => {
    const eff = await getEffectiveSeller();
    return ok({ snapshot: eff.snapshot, sources: eff.sources });
  },
  { hyperAdminOnly: true, permission: "platform:read" }
);

export const POST = withApiHandler(
  async ({ ctx, body }) => {
    const res = await saveSellerProfile(ctx, body);
    if (!res.ok) return res;
    const eff = await getEffectiveSeller();
    return ok({ snapshot: eff.snapshot, sources: eff.sources });
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
