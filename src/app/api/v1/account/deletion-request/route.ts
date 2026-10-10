import { withApiHandler } from "@/lib/api/handler";
import { getMyDeletionRequestTool, requestAccountDeletionTool } from "@/lib/services/account-deletion-tools";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/account/deletion-request { reason?, confirm: true } —
 * girişli kullanıcı KENDİ hesabı için silme talebi açar. Idempotent
 * (açık talep varken aynı kayıt döner). Self-service: permission
 * gerekmez, yalnız kimlik doğrulama. Rate-limit tool içindedir.
 */
export const POST = withApiHandler(async ({ ctx, body }) => requestAccountDeletionTool(ctx, body));

/** GET /api/v1/account/deletion-request — kendi talepleri (açık + geçmiş). */
export const GET = withApiHandler(async ({ ctx }) => getMyDeletionRequestTool(ctx));
