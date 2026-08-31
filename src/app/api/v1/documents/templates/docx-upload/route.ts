import { withApiHandler } from "@/lib/api/handler";
import { uploadDocumentTemplateDocxTool } from "@/lib/services";
import { enforceUserRateLimit } from "@/lib/api/rate-limit-guard";

export const dynamic = "force-dynamic";

const UPLOAD_RATE_WINDOW_MS = 60_000;
const UPLOAD_RATE_MAX = 10;

/**
 * POST /api/v1/documents/templates/docx-upload { kind, name, fileName, fileMimeType, fileData }
 * DOCX-öncelikli şablon iş akışı — her zaman YENİ bir TASLAK (active:false) oluşturur.
 */
export const POST = withApiHandler(
  async ({ ctx, body }) => {
    const limited = enforceUserRateLimit("template-docx-upload", ctx.userId, {
      windowMs: UPLOAD_RATE_WINDOW_MS,
      max: UPLOAD_RATE_MAX,
    });
    if (limited) return limited;
    return uploadDocumentTemplateDocxTool(ctx, body);
  },
  { permission: "documents:write" }
);
