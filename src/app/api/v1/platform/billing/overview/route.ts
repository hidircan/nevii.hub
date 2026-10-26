import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { fail, ok } from "@/lib/services/result";
import { updateTenantSetting } from "@/lib/platform/service";
import { appendPlatformAudit } from "@/lib/platform/store";
import { getBillingOverview } from "@/lib/saas-billing/overview";
import { reconcileSubscriptions } from "@/lib/saas-billing/webhooks";
import { decideTrialRequest } from "@/lib/saas-billing/trial";
import { approveManualPayment } from "@/lib/saas-billing/manual";
import { getSaasAttemptById, releaseStuckClaim } from "@/lib/saas-billing/store";

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
 * - release_claim: takılı belirsiz denemeyi DIŞ DOĞRULAMA + gerekçe + audit
 *   ile kapatır (yeni çekime izin). Ödeme geçmişi/audit silinmez.
 */
export const POST = withApiHandler(
  async ({ ctx, body }) => {
    const parsed = z
      .object({ action: z.enum(["exception", "enforcement", "reconcile", "trial_decide", "manual_approve", "release_claim"]) })
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

    if (action === "manual_approve") {
      const { action: _a, ...input } = (body as Record<string, unknown>) ?? {};
      void _a;
      const res = await approveManualPayment({ input, approvedBy: ctx.userId });
      if (!res.ok) return res;
      await appendPlatformAudit({
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        actorTenantId: ctx.tenantId,
        targetTenantId: (input as { tenantId?: string }).tenantId ?? null,
        action: "billing.manual.approve",
        entityType: "saas_collection_attempt",
        entityId: (input as { providerRef?: string }).providerRef ?? "-",
        before: null,
        after: { paidThrough: res.data.paidThrough },
        requestId: ctx.requestId ?? "-",
        outcome: "success",
      });
      return ok(res.data);
    }

    if (action === "release_claim") {
      const v = z
        .object({
          attemptId: z.string().min(1),
          reason: z.string().trim().min(10).max(300),
          /** Sağlayıcı panelindeki dış doğrulama kaydı (zorunlu). */
          externalRef: z.string().trim().min(3).max(120),
        })
        .safeParse(body);
      if (!v.success) return fail("VALIDATION_ERROR", "Geçersiz serbest bırakma isteği.");
      const target = await getSaasAttemptById(v.data.attemptId);
      if (!target) return fail("NOT_FOUND", "Tahsilat denemesi bulunamadı.");
      if (target.status !== "uncertain") {
        return fail("VALIDATION_ERROR", "Yalnızca belirsiz (uncertain) denemeler serbest bırakılabilir.");
      }
      const released = await releaseStuckClaim({
        attemptId: v.data.attemptId,
        reason: v.data.reason,
        actorUserId: ctx.userId,
        externalRef: v.data.externalRef,
      });
      if (!released) return fail("CONFLICT", "Deneme bu arada çözüldü; işlem yapılmadı.");
      await appendPlatformAudit({
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        actorTenantId: ctx.tenantId,
        targetTenantId: target.tenantId,
        action: "billing.claim.release",
        entityType: "saas_collection_attempt",
        entityId: v.data.attemptId,
        before: { status: "uncertain", providerRef: target.providerRef },
        after: { status: "failed", reason: v.data.reason, externalRef: v.data.externalRef },
        requestId: ctx.requestId ?? "-",
        outcome: "success",
      });
      return ok({ attemptId: v.data.attemptId, released: true });
    }

    const v = z.object({ limit: z.number().int().min(1).max(100).optional() }).safeParse(body);
    const rec = await reconcileSubscriptions({ limit: v.success ? (v.data.limit ?? 25) : 25 });
    if (!rec.ok) return rec;
    return ok(rec.data);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
