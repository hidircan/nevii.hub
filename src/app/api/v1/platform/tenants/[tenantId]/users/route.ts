import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { listInstitutionUsers } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx, params }) => {
    const tenantId = params.tenantId;
    if (!tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return listInstitutionUsers(ctx, tenantId);
  },
  { hyperAdminOnly: true, permission: "platform:read" }
);
