import { withApiHandler } from "@/lib/api/handler";
import { fail } from "@/lib/services/result";
import {
  deactivateUser,
  hardDeleteUser,
  listPlatformUsers,
  reactivateUser,
  resendInvitation,
  revokeInvitation,
  setPortalAccess,
  softDeleteUser,
  startPasswordReset,
} from "@/lib/platform/user-lifecycle";

export const dynamic = "force-dynamic";

/** Filtreler sunucuda uygulanır: q, tenantId, role, branchId, status, invite. */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) =>
    listPlatformUsers(ctx, Object.fromEntries([...searchParams.entries()].filter(([, v]) => v !== ""))),
  { hyperAdminOnly: true, permission: "platform:read" }
);

const OPS = {
  deactivate: deactivateUser,
  reactivate: reactivateUser,
  soft_delete: softDeleteUser,
  hard_delete: hardDeleteUser,
  portal: setPortalAccess,
  invite_revoke: revokeInvitation,
  invite_resend: resendInvitation,
  password_reset: startPasswordReset,
} as const;

export const POST = withApiHandler(
  async ({ ctx, body }) => {
    const op = (body as { op?: string } | null)?.op as keyof typeof OPS | undefined;
    const fn = op ? OPS[op] : undefined;
    if (!fn) return fail("VALIDATION_ERROR", "Bilinmeyen işlem");
    return fn(ctx, body);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
