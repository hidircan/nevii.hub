import { withApiHandler } from "@/lib/api/handler";
import { fail, ok } from "@/lib/services/result";
import { appendPlatformAudit } from "@/lib/platform/store";
import { getEDocument, getInvoiceOrder, saveEDocument } from "@/lib/saas-billing/store";
import { sendInvoiceReadyEmail } from "@/lib/saas-billing/emails";

export const dynamic = "force-dynamic";

/**
 * POST — belge e-postasını yeniden gönder. YALNIZ iletimi tekrar dener;
 * belgeyi YENİDEN KESMEZ. Düzenlenmemiş belge için çalışmaz.
 */
export const POST = withApiHandler(
  async ({ ctx, params, request }) => {
    const id = params?.id;
    if (typeof id !== "string" || !id) return fail("VALIDATION_ERROR", "Belge kimliği eksik.");
    const doc = await getEDocument(id);
    if (!doc) return fail("NOT_FOUND", "Belge bulunamadı.");
    if (doc.status !== "issued" && doc.status !== "transmitted" && doc.status !== "transmission_pending") {
      return fail("VALIDATION_ERROR", "Yalnız düzenlenmiş belgenin iletimi tekrar denenir.");
    }
    const order = await getInvoiceOrder(doc.orderId);
    if (!order) return fail("NOT_FOUND", "Sipariş bulunamadı.");
    const origin = new URL(request.url).origin;
    const res = await sendInvoiceReadyEmail({
      to: order.buyer.invoiceEmail,
      planLabel: order.planLabel,
      totalMinor: order.totalMinor,
      periodStart: order.periodStart,
      periodEnd: order.periodEnd,
      detailUrl: `${origin}/abonelik/faturalar/${order.id}`,
      demo: doc.kind === "demo_preview",
    });
    doc.emailStatus = res.sent ? "sent" : "failed";
    doc.emailError = res.sent ? null : res.reason;
    doc.updatedAt = new Date().toISOString();
    await saveEDocument(doc);
    await appendPlatformAudit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorTenantId: ctx.tenantId,
      targetTenantId: doc.tenantId,
      action: "saas.edoc.resend_email",
      entityType: "EDocument",
      entityId: id,
      before: null as never,
      after: { emailStatus: doc.emailStatus, reason: doc.emailError } as never,
      requestId: ctx.requestId || "n/a",
      outcome: res.sent ? "success" : "error",
    });
    if (!res.sent) return fail("INTERNAL_ERROR", `E-posta gönderilemedi: ${res.reason}`);
    return ok({ emailStatus: doc.emailStatus });
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
