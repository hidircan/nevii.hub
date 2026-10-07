import { withApiHandler } from "@/lib/api/handler";
import { addClubMemberTool, endClubMembershipTool, updateClubMembershipTool, writeClubMemberStartFeeTool } from "@/lib/clubs";

export const dynamic = "force-dynamic";

/** POST /api/v1/clubs/members { clubId, studentId, startDate? } — üye ekle (başlangıç ayının ücreti yazılır). */
export const POST = withApiHandler(async ({ ctx, body }) => addClubMemberTool(ctx, body));

/**
 * PATCH /api/v1/clubs/members:
 *  - { membershipId, endDate? } — üyeliği sonlandır (silinmez)
 *  - { action: "update", membershipId, startDate?, endDate? } — yanlış tarihi düzelt / sonlandırmayı geri al (endDate "")
 *  - { action: "startFee", membershipId } — başlangıç ayı ücretini yöneticinin açık işlemiyle yaz
 */
export const PATCH = withApiHandler(async ({ ctx, body }) => {
  const action = (body as { action?: string } | null)?.action;
  if (action === "update") return updateClubMembershipTool(ctx, body);
  if (action === "startFee") return writeClubMemberStartFeeTool(ctx, body);
  return endClubMembershipTool(ctx, body);
});
