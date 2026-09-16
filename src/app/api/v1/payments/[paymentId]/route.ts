import { withApiHandler } from "@/lib/api/handler";
import { updatePaymentTool } from "@/lib/services";
import { resolveWriteScope } from "@/lib/institution/write-scope";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { auditLog } from "@/lib/auth/audit";
import { uid } from "@/lib/utils";
import { jsonFail } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/v1/payments/:paymentId — tahsil edilmiş bir ödemenin tutar/yöntem/
 * tarih/not alanlarını düzenler (bkz. updatePaymentTool). Sahip kararı
 * (2026-09-16): sözleşme ekranında kayıt anı ilk tahsilatında bir hata
 * görülürse kullanıcı ekran değiştirmeden buradan düzeltebilmeli.
 */
export const PATCH = withApiHandler(
  async ({ ctx, params, body }) => {
    const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const writeScope = await resolveWriteScope(ctx);
    if (writeScope.mode !== "single") {
      auditLog({
        action: "payments.update",
        requestId: uid("audit"),
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        role: ctx.role,
        outcome: "denied",
        meta: { scopeMode: writeScope.mode },
      });
      return jsonFail("FORBIDDEN", writeScope.reason);
    }

    const scopedCtx = { ...ctx, tenantId: writeScope.tenantId };
    const result = await runWithTenantAsync(writeScope.tenantId, () =>
      updatePaymentTool(scopedCtx, {
        paymentId: params.paymentId,
        ...(typeof b.method === "string" ? { method: b.method } : {}),
        ...(typeof b.amount === "number" ? { amount: b.amount } : {}),
        ...(typeof b.paidAt === "string" && b.paidAt.trim() ? { paidAt: b.paidAt } : {}),
        ...(typeof b.paymentNote === "string" ? { paymentNote: b.paymentNote } : {}),
      })
    );
    auditLog({
      action: "payments.update",
      requestId: uid("audit"),
      userId: ctx.userId,
      tenantId: writeScope.tenantId,
      role: ctx.role,
      outcome: result.ok ? "success" : "error",
      meta: { scopeMode: "single" },
    });
    return result;
  },
  { permission: "payments:write" }
);
