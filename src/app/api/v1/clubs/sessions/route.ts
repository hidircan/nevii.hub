import { withApiHandler } from "@/lib/api/handler";
import { fail } from "@/lib/services/result";
import { cancelClubSessionTool, markClubSessionTeacherTool, postponeClubSessionTool, scheduleClubSessionsTool } from "@/lib/clubs";

export const dynamic = "force-dynamic";

/** POST /api/v1/clubs/sessions { clubId, teacherId, roomId, startLocal, weeks } — oturum(lar) planla. */
export const POST = withApiHandler(async ({ ctx, body }) => scheduleClubSessionsTool(ctx, body));

/**
 * PATCH /api/v1/clubs/sessions { action, sessionId, … }:
 *  - "teacher"  { status: geldi|gelmedi|mazeretli } — öğretmen yoklaması (tüm satırlara)
 *  - "postpone" { startLocal, roomId?, reason } — oturumu toptan ertele (Telafi) + yeni oturum
 *  - "cancel"   — yoklaması girilmemiş oturumu iptal et
 */
export const PATCH = withApiHandler(async ({ ctx, body }) => {
  const action = (body as { action?: string } | null)?.action;
  if (action === "teacher") return markClubSessionTeacherTool(ctx, body);
  if (action === "postpone") return postponeClubSessionTool(ctx, body);
  if (action === "cancel") return cancelClubSessionTool(ctx, body);
  return fail("VALIDATION_ERROR", "Geçersiz oturum işlemi. Sayfayı yenileyip tekrar deneyin.");
});
