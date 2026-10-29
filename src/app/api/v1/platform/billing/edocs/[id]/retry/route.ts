import { withApiHandler } from "@/lib/api/handler";
import { fail, ok } from "@/lib/services/result";
import { appendPlatformAudit } from "@/lib/platform/store";
import { getEDocument } from "@/lib/saas-billing/store";
import { retryDocument } from "@/lib/saas-billing/invoicing-orders";

export const dynamic = "force-dynamic";

/** POST — başarısız/manuel belgeyi güvenli şekilde yeniden dene (audit izli, deneme sınırlı). */
export const POST = withApiHandler(
  async ({ ctx, params }) => {
    const id = params?.id;
    if (typeof id !== "string" || !id) return fail("VALIDATION_ERROR", "Belge kimliği eksik.");
    const before = await getEDocument(id);
    if (!before) return fail("NOT_FOUND", "Belge bulunamadı.");
    const res = await retryDocument(id);
    if (!res.ok) return res;
    await appendPlatformAudit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorTenantId: ctx.tenantId,
      targetTenantId: before.tenantId,
      action: "saas.edoc.retry",
      entityType: "EDocument",
      entityId: id,
      before: { status: before.status, retryCount: before.retryCount } as never,
      after: { status: res.data.doc.status, retryCount: res.data.doc.retryCount } as never,
      requestId: ctx.requestId || "n/a",
      outcome: "success",
    });
    return ok({ doc: res.data.doc });
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
