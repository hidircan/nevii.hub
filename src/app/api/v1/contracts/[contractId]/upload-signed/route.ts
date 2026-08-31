import { withApiHandler } from "@/lib/api/handler";
import { uploadStudentContractSignedScanTool } from "@/lib/services";
import { enforceUserRateLimit } from "@/lib/api/rate-limit-guard";

export const dynamic = "force-dynamic";

const UPLOAD_RATE_WINDOW_MS = 60_000;
const UPLOAD_RATE_MAX = 20;

/** POST /api/v1/contracts/:contractId/upload-signed { fileName, fileMimeType, fileData } — ıslak imzalı taranmış nüsha. */
export const POST = withApiHandler(
  async ({ ctx, body, params }) => {
    const limited = enforceUserRateLimit("upload", ctx.userId, {
      windowMs: UPLOAD_RATE_WINDOW_MS,
      max: UPLOAD_RATE_MAX,
    });
    if (limited) return limited;
    return uploadStudentContractSignedScanTool(ctx, {
      ...(typeof body === "object" && body !== null ? (body as object) : {}),
      contractId: params.contractId,
    });
  },
  { permission: "contracts:write" }
);
