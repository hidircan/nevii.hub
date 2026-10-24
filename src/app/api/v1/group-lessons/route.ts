import { withApiHandler } from "@/lib/api/handler";
import { fail } from "@/lib/services/result";
import {
  listGroupLessonsTool,
  addGroupSessionTool,
  backfillGroupSessionsTool,
  cancelGroupSessionTool,
  createGroupLessonTool,
  endGroupLessonTool,
  syncGroupLessonTool,
  updateGroupLessonTool,
} from "@/lib/group-lessons";

export const dynamic = "force-dynamic";

/** GET /api/v1/group-lessons — grup listesi (doluluk, sonraki oturum); panel ve mobil yönetici. */
export const GET = withApiHandler(async ({ ctx }) => listGroupLessonsTool(ctx));

/** POST /api/v1/group-lessons { name?, teacherId, instrument, roomId, capacity, durationMinutes, monthlyFee, recurrence, startTime, startsOn, endsOn? } */
export const POST = withApiHandler(async ({ ctx, body }) => createGroupLessonTool(ctx, body));

/**
 * PATCH /api/v1/group-lessons { action, groupLessonId, … }:
 *  - "update" (tanım alanları) · "end" · "sync" { studentId? }
 *  - "cancelSession" { sessionKey } · "addSession" { startLocal } (geçmiş tarih: yapılmış dersi işler)
 *  - "backfill" { dryRun?, skipIssues? } — başlangıçtan bugüne eksik geçmiş oturum satırları (önizleme + onay)
 */
export const PATCH = withApiHandler(async ({ ctx, body }) => {
  const action = (body as { action?: string } | null)?.action;
  if (action === "update") return updateGroupLessonTool(ctx, body);
  if (action === "end") return endGroupLessonTool(ctx, body);
  if (action === "sync") return syncGroupLessonTool(ctx, body);
  if (action === "cancelSession") return cancelGroupSessionTool(ctx, body);
  if (action === "addSession") return addGroupSessionTool(ctx, body);
  if (action === "backfill") return backfillGroupSessionsTool(ctx, body);
  return fail("VALIDATION_ERROR", "Geçersiz grup dersi işlemi. Sayfayı yenileyip tekrar deneyin.");
});
