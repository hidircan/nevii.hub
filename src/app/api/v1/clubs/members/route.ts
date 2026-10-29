import { withApiHandler } from "@/lib/api/handler";
import {
  addClubMemberTool,
  deleteClubMembershipTool,
  endClubMembershipTool,
  searchClubMemberCandidatesTool,
  updateClubMembershipTool,
  writeClubMemberStartFeeTool,
} from "@/lib/clubs";

export const dynamic = "force-dynamic";

/** GET /api/v1/clubs/members?clubId=&q= — üye ekleme araması (ad; en fazla 20 sonuç, en az kişisel veri). */
export const GET = withApiHandler(async ({ ctx, searchParams }) =>
  searchClubMemberCandidatesTool(ctx, { clubId: searchParams.get("clubId") ?? "", q: searchParams.get("q") ?? "" })
);

/** POST /api/v1/clubs/members { clubId, studentId, startDate? } — üye ekle (başlangıç ayının ücreti yazılır). */
export const POST = withApiHandler(async ({ ctx, body }) => addClubMemberTool(ctx, body));

/**
 * PATCH /api/v1/clubs/members:
 *  - { membershipId, endDate? } — üyeliği sonlandır (silinmez; tekrar çağrı idempotent)
 *  - { action: "update", membershipId, startDate?, endDate? } — yanlış tarihi düzelt / sonlandırmayı geri al (endDate "")
 *  - { action: "startFee", membershipId } — başlangıç ayı ücretini yöneticinin açık işlemiyle yaz
 */
export const PATCH = withApiHandler(async ({ ctx, body }) => {
  const action = (body as { action?: string } | null)?.action;
  if (action === "update") return updateClubMembershipTool(ctx, body);
  if (action === "startFee") return writeClubMemberStartFeeTool(ctx, body);
  return endClubMembershipTool(ctx, body);
});

/** DELETE /api/v1/clubs/members { membershipId } — yanlışlıkla eklenen üyeliği sil (öğrenci/ödeme/başvuru kaydı silinmez). */
export const DELETE = withApiHandler(async ({ ctx, body }) => deleteClubMembershipTool(ctx, body));
