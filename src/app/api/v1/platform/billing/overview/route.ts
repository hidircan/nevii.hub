import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { fail, ok } from "@/lib/services/result";
import { updateTenantSetting } from "@/lib/platform/service";
import { appendPlatformAudit } from "@/lib/platform/store";
import { getBillingOverview } from "@/lib/saas-billing/overview";
import { reconcileSubscriptions } from "@/lib/saas-billing/webhooks";
import { decideTrialRequest } from "@/lib/saas-billing/trial";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/platform/billing/overview
 * NeviiOS: abonelikler, trial bitişleri, paid-through, başarısız ödemeler,
 * son webhook/mutabakat, aktif istisnalar. Sınırlı listeler (tam okuma yok).
 */
export const GET = withApiHandler(
  async () => ok(await getBillingOverview()),
  { hyperAdminOnly: true, permission: "platform:read" }
);

const exceptionSchema = z.object({
  tenantId: z.string().min(1),
  /** ISO bitiş zamanı — zorunlu. */
  until: z.iso.datetime(),
  /** Gerekçe — zorunlu, en az 10 karakter. */
  reason: z.string().trim().min(10).max(300),
});

/**
 * POST /api/v1/platform/billing/overview
 * İki işlem (action ile ayrılır):
 * - exception: HYPER_ADMIN manuel süre/istisna (gerekçe + bitiş + audit;
 *   "ödenmiş" kaydı taklit etmez).
 * - enforcement: kurum bazlı kontrollü billingEnforcement açma/kapama.
 * - reconcile: ölçülü mutabakat tetikleme (varsayılan 25 abonelik).
 */
export const POST = withApiHandler(
  async ({ ctx, body }) => {
    const parsed = z
      .object({ action: z.enum(["exception", "enforcement", "reconcile", "trial_decide"]) })
      .passthrough()
      .safeParse(body);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz işlem.");
    const action = (parsed.data as { action: string }).action;

    if (action === "trial_decide") {
      const v = z
        .object({
          requestId: z.string().min(1),
          approve: z.boolean(),
          tenantId: z.string().min(1).optional(),
        })
        .safeParse(body);
      if (!v.success) return fail("VALIDATION_ERROR", "Geçersiz deneme kararı.");
      const res = await decideTrialRequest({
        requestId: v.data.requestId,
        approve: v.data.approve,
        tenantId: v.data.tenantId,
        decidedBy: ctx.userId,
      });
      if (!res.ok) return res;
      await appendPlatformAudit({
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        actorTenantId: ctx.tenantId,
        targetTenantId: v.data.tenantId ?? null,
        action: v.data.approve ? "billing.trial.approve" : "billing.trial.reject",
        entityType: "saas_trial_request",
        entityId: v.data.requestId,
        before: null,
        after: { status: res.data.status, tenantId: res.data.tenantId },
        requestId: ctx.requestId ?? "-",
        outcome: "success",
      });
      return ok({ requestId: v.data.requestId, status: res.data.status });
    }

    if (action === "exception") {
      const v = exceptionSchema.safeParse(body);
      if (!v.success) {
        return fail("VALIDATION_ERROR", v.error.issues[0]?.message ?? "Geçersiz istisna.");
      }
      const res = await updateTenantSetting(ctx, v.data.tenantId, {
        key: "billing.exception",
        value: { until: v.data.until, reason: v.data.reason, by: ctx.userId },
        reason: v.data.reason,
      });
      if (!res.ok) return res;
      await appendPlatformAudit({
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        actorTenantId: ctx.tenantId,
        targetTenantId: v.data.tenantId,
        action: "billing.exception.grant",
        entityType: "saas_subscription",
        entityId: v.data.tenantId,
        before: null,
        after: { until: v.data.until, reason: v.data.reason },
        requestId: ctx.requestId ?? "-",
        outcome: "success",
      });
      return ok({ tenantId: v.data.tenantId, until: v.data.until });
    }

    if (action === "enforcement") {
      const v = z
        .object({ tenantId: z.string().min(1), enabled: z.boolean() })
        .safeParse(body);
      if (!v.success) return fail("VALIDATION_ERROR", "Geçersiz enforcement isteği.");
      const res = await updateTenantSetting(ctx, v.data.tenantId, {
        key: "billing.enforcement",
        value: v.data.enabled,
        reason: v.data.enabled
          ? "Kontrollü billing migrate: enforcement açıldı"
          : "Enforcement kapatıldı (legacy/managed)",
      });
      if (!res.ok) return res;
      await appendPlatformAudit({
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        actorTenantId: ctx.tenantId,
        targetTenantId: v.data.tenantId,
        action: v.data.enabled ? "billing.enforcement.enable" : "billing.enforcement.disable",
        entityType: "saas_subscription",
        entityId: v.data.tenantId,
        before: null,
        after: { enabled: v.data.enabled },
        requestId: ctx.requestId ?? "-",
        outcome: "success",
      });
      return ok({ tenantId: v.data.tenantId, enabled: v.data.enabled });
    }

    const v = z.object({ limit: z.number().int().min(1).max(100).optional() }).safeParse(body);
    const rec = await reconcileSubscriptions({ limit: v.success ? (v.data.limit ?? 25) : 25 });
    if (!rec.ok) return rec;
    return ok(rec.data);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
