import { withApiHandler } from "@/lib/api/handler";
import { deleteSignedDocumentVersionTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** DELETE /api/v1/documents/:documentId/signed-versions/:versionId — soft-delete, audit'li; gövde: { criticalPassword, reason }. */
export const DELETE = withApiHandler(
  async ({ ctx, body, params }) =>
    deleteSignedDocumentVersionTool(ctx, {
      ...(typeof body === "object" && body !== null ? (body as object) : {}),
      documentId: params.documentId,
      versionId: params.versionId,
    }),
  { permission: "documents:write" }
);
