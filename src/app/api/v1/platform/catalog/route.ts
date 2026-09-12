import { withApiHandler } from "@/lib/api/handler";
import { fail } from "@/lib/services/result";
import {
  computePlanPrice,
  deleteCatalogPlan,
  getCatalogOverview,
  getPublishedCatalog,
  setCatalogPlanStatus,
  upsertCatalogModule,
  upsertCatalogPlan,
  validateCatalog,
} from "@/lib/platform/commercial-catalog";
import { discardPolicyDraft, previewPolicyDraft, publishPolicyDraft, rollbackPolicy } from "@/lib/platform/policy-versions";
import { listPolicyVersions } from "@/lib/platform/store-ext";
import { COMMERCIAL_CATALOG_KEY, PLATFORM_SCOPE_ID } from "@/lib/platform/policy-version-log";

export const dynamic = "force-dynamic";

/** GET — yayındaki + taslak katalog, abonelik sayıları, sürüm geçmişi. Yalnız HYPER_ADMIN. */
export const GET = withApiHandler(async ({ ctx }) => getCatalogOverview(ctx), { hyperAdminOnly: true, permission: "platform:read" });

/**
 * body.op:
 *  plan_upsert | plan_status | plan_delete | module_upsert — taslağı düzenler (audit)
 *  quote { source: "draft"|"published", planKey, cycle, addons, adjustment } — fiyat motoru (yazmaz)
 *  preview { draftId } | publish { draftId, confirm } | discard { draftId }
 *  rollback { toVersion?, reason, confirm } — eski sürümü silmeden yeni sürüm üretir
 */
export const POST = withApiHandler(
  async ({ ctx, body }) => {
    const b = (body ?? {}) as Record<string, unknown> & { op?: string };
    switch (b.op) {
      case "plan_upsert":
        return upsertCatalogPlan(ctx, b);
      case "plan_status":
        return setCatalogPlanStatus(ctx, b);
      case "plan_delete":
        return deleteCatalogPlan(ctx, b);
      case "module_upsert":
        return upsertCatalogModule(ctx, b);
      case "quote": {
        let catalog = (await getPublishedCatalog()).catalog;
        if (b.source === "draft") {
          const draft = (await listPolicyVersions(PLATFORM_SCOPE_ID, COMMERCIAL_CATALOG_KEY)).find((v) => v.status === "draft");
          const v = draft ? validateCatalog(draft.value) : null;
          if (v?.ok) catalog = v.data;
        }
        return computePlanPrice(catalog, b as never);
      }
      case "preview":
        return previewPolicyDraft(ctx, PLATFORM_SCOPE_ID, String(b.draftId ?? ""));
      case "publish":
        return publishPolicyDraft(ctx, PLATFORM_SCOPE_ID, b);
      case "discard":
        return discardPolicyDraft(ctx, PLATFORM_SCOPE_ID, b);
      case "rollback":
        return rollbackPolicy(ctx, PLATFORM_SCOPE_ID, { ...b, key: COMMERCIAL_CATALOG_KEY });
      default:
        return fail("VALIDATION_ERROR", "Bilinmeyen işlem");
    }
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
