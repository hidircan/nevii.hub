import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { getDocumentTemplateSourceFileTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/documents/templates/:templateId/source-file — DOCX olarak yüklenmiş ORİJİNAL dosyayı ham baytlar olarak döner. */
export const GET = withApiHandler(
  async ({ ctx, params }) => {
    const result = await getDocumentTemplateSourceFileTool(ctx, { templateId: params.templateId });
    if (!result.ok) return result;
    const { fileName, fileMimeType, fileData } = result.data;
    const buffer = Buffer.from(fileData, "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": fileMimeType,
        "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  },
  { permission: "documents:read" }
);
