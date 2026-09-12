import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { listOwnerInvitations } from "@/lib/platform/provision";
import { inviteTenantUser } from "@/lib/platform/users-admin";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx, params }) => {
    if (!params.tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return listOwnerInvitations(ctx, params.tenantId);
  },
  { hyperAdminOnly: true, permission: "platform:read" }
);

/** Davet üretir; ham bağlantı yalnız bu yanıtta bir kez döner (e-posta GÖNDERİLMEZ). */
export const POST = withApiHandler(
  async ({ ctx, params, body }) => {
    if (!params.tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return inviteTenantUser(ctx, params.tenantId, body);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
