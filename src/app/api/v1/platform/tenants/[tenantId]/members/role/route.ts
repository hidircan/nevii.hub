import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { assignRole, previewRoleChange } from "@/lib/platform/users-admin";

export const dynamic = "force-dynamic";

/** `?preview=1` yalnız etki önizlemesi döner; aksi halde onaylı atama yapar. */
export const POST = withApiHandler(
  async ({ ctx, params, body, searchParams }) => {
    if (!params.tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return searchParams.get("preview") === "1"
      ? previewRoleChange(ctx, params.tenantId, body)
      : assignRole(ctx, params.tenantId, body);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
