import { withApiHandler } from "@/lib/api/handler";
import { fail } from "@/lib/services/result";
import { listLiveOperations, revokeAllSessions, revokeSession } from "@/lib/platform/live-ops";

export const dynamic = "force-dynamic";

/** GET ?q=&tenantId=&role=&only=online — canlı oturumlar (e-posta maskeli). Yalnız HYPER_ADMIN. */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) =>
    listLiveOperations(ctx, Object.fromEntries([...searchParams.entries()].filter(([, v]) => v !== ""))),
  { hyperAdminOnly: true, permission: "platform:read" }
);

/**
 * body.op: revoke (tekil oturum) | revoke_all (kullanıcının tüm oturumları).
 * Pasifleştir / aktifleştir / davet / şifre sıfırlama: /api/v1/platform/users.
 */
export const POST = withApiHandler(
  async ({ ctx, body }) => {
    switch ((body as { op?: string } | null)?.op) {
      case "revoke":
        return revokeSession(ctx, body);
      case "revoke_all":
        return revokeAllSessions(ctx, body);
      default:
        return fail("VALIDATION_ERROR", "Bilinmeyen işlem");
    }
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);
