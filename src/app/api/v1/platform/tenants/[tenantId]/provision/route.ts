import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { provisionTenant } from "@/lib/platform/provision";

export const dynamic = "force-dynamic";

/** Taslak kurumu kurar (STORE_MODE=db). İdempotent: aktif kurumda tekrar çağrı replay döner. */
export const POST = withApiHandler(
  async ({ ctx, params, body }) => {
    if (!params.tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    const retry = Boolean((body as { retry?: boolean } | null)?.retry);
    return provisionTenant(ctx, params.tenantId, { retry });
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
