import { withApiHandler } from "@/lib/api/handler";
import { createPaymentTool } from "@/lib/services";
import { readPaymentById } from "@/lib/store";
import { markPaymentCasesPaid } from "@/lib/tahsilat/cases";
import { resolveWriteScope } from "@/lib/institution/write-scope";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { auditLog } from "@/lib/auth/audit";
import { uid } from "@/lib/utils";
import { jsonFail } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/** POST /api/v1/payments/:paymentId/pay — closes linked AI follow-up cases for ROI. */
export const POST = withApiHandler(
  async ({ ctx, params, body }) => {
    const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const method = typeof b.method === "string" ? b.method : undefined;
    /** Paket 6 — Yoklama Takvimi'nden tahsilat: yönetici tutarı elle girebilir. */
    const amount = typeof b.amount === "number" ? b.amount : undefined;
    const paymentNote = typeof b.paymentNote === "string" ? b.paymentNote : undefined;
    /** Bilinçli gönderilmezse fiili tahsil anı = şimdi (vade/ay ile karışmasın). */
    const paidAt =
      typeof b.paidAt === "string" && b.paidAt.trim()
        ? b.paidAt
        : new Date().toISOString();
    const writeScope = await resolveWriteScope(ctx);
    if (writeScope.mode !== "single") {
      auditLog({
        action: "payments.pay",
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
      createPaymentTool(scopedCtx, {
        paymentId: params.paymentId,
        ...(method ? { method } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(paymentNote !== undefined ? { paymentNote } : {}),
        paidAt,
      })
    );
    if (result.ok) {
      // DB egress (2026-10-10): yalnız tahsil edilen satır okunur (eskiden tenant'ın tüm verisi).
      const payment = await runWithTenantAsync(writeScope.tenantId, () => readPaymentById(params.paymentId));
      if (payment) {
        await markPaymentCasesPaid({
          tenantId: writeScope.tenantId,
          paymentId: payment.id,
          // Gerçekte tahsil edilen (elle girilmiş olabilir) tutar — orijinal
          // Payment.amount değil, ROI/vaka kapatma her zaman fiili tahsilatı yansıtır.
          amount: Number(payment.paidAmount),
        });
      }
    }
    auditLog({
      action: "payments.pay",
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
