import { withApiHandler } from "@/lib/api/handler";
import { uploadDocumentDirectTool } from "@/lib/services";
import { enforceUserRateLimit } from "@/lib/api/rate-limit-guard";

export const dynamic = "force-dynamic";

const UPLOAD_RATE_WINDOW_MS = 60_000;
const UPLOAD_RATE_MAX = 20;

/**
 * POST /api/v1/documents/upload-direct { kind, fileName, fileMimeType, fileData, studentId?, teacherId? }
 * Şablon doldurmadan, kategori seçip doğrudan dosya yükleme.
 */
export const POST = withApiHandler(
  async ({ ctx, body }) => {
    const limited = enforceUserRateLimit("upload", ctx.userId, {
      windowMs: UPLOAD_RATE_WINDOW_MS,
      max: UPLOAD_RATE_MAX,
    });
    if (limited) return limited;
    return uploadDocumentDirectTool(ctx, body);
  },
  { permission: "documents:write" }
);
