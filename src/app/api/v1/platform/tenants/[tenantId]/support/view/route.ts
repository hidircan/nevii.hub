import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { getSupportDataView } from "@/lib/platform/support-access";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx, params }) => {
    if (!params.tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return getSupportDataView(ctx, params.tenantId);
  },
  { hyperAdminOnly: true, permission: "platform:read" }
);
