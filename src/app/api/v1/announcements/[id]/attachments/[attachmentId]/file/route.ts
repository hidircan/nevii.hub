import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { getAnnouncementAttachmentFileTool } from "@/lib/services";
import { enforceUserRateLimit } from "@/lib/api/rate-limit-guard";

export const dynamic = "force-dynamic";

const DOWNLOAD_RATE_WINDOW_MS = 60_000;
const DOWNLOAD_RATE_MAX = 60;

/**
 * GET /api/v1/announcements/:id/attachments/:attachmentId/file
 * Tenant + audience (veya admin) kontrolü tool katmanında.
 */
export const GET = withApiHandler(
  async ({ ctx, params }) => {
    const limited = enforceUserRateLimit("attachment-download", ctx.userId, {
      windowMs: DOWNLOAD_RATE_WINDOW_MS,
      max: DOWNLOAD_RATE_MAX,
    });
    if (limited) return limited;
    const result = await getAnnouncementAttachmentFileTool(ctx, {
      announcementId: params.id,
      attachmentId: params.attachmentId,
    });
    if (!result.ok) return result;
    const buffer = Buffer.from(result.data.fileData, "base64");
    const safeName = (result.data.fileName || "ek").replace(/"/g, "");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": result.data.fileMimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  },
  { permission: "announcements:read" }
);
