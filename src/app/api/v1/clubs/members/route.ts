import { withApiHandler } from "@/lib/api/handler";
import { addClubMemberTool, endClubMembershipTool } from "@/lib/clubs";

export const dynamic = "force-dynamic";

/** POST /api/v1/clubs/members { clubId, studentId, startDate? } — üye ekle (başlangıç ayının ücreti yazılır). */
export const POST = withApiHandler(async ({ ctx, body }) => addClubMemberTool(ctx, body));

/** PATCH /api/v1/clubs/members { membershipId, endDate? } — üyeliği sonlandır (silinmez). */
export const PATCH = withApiHandler(async ({ ctx, body }) => endClubMembershipTool(ctx, body));
