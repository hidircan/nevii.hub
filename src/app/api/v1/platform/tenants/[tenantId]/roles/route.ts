import { withApiHandler } from "@/lib/api/handler";
import { fail } from "@/lib/services/result";
import {
  archiveCustomRole,
  assignCustomRole,
  listCustomRoles,
  previewCustomRole,
  saveCustomRole,
  unassignCustomRole,
} from "@/lib/platform/custom-roles";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx, params }) => listCustomRoles(ctx, params.tenantId ?? ""),
  { hyperAdminOnly: true, permission: "platform:read" }
);

/** body.op: preview | save | archive | assign | unassign */
export const POST = withApiHandler(
  async ({ ctx, params, body }) => {
    const tenantId = params.tenantId ?? "";
    switch ((body as { op?: string } | null)?.op) {
      case "preview":
        return previewCustomRole(ctx, tenantId, body);
      case "save":
        return saveCustomRole(ctx, tenantId, body);
      case "archive":
        return archiveCustomRole(ctx, tenantId, body);
      case "assign":
        return assignCustomRole(ctx, tenantId, body);
      case "unassign":
        return unassignCustomRole(ctx, tenantId, body);
      default:
        return fail("VALIDATION_ERROR", "Bilinmeyen işlem");
    }
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
