import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { getContractSignedFileTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/contracts/:contractId/signed-file — ıslak imzalı taranmış
 * nüshanın ham baytları. Sahiplik kontrolü tool katmanında yapılır (bkz.
 * getContractSignedFileTool) — homework/documents dosya rotalarıyla AYNI
 * desen: asla parametresiz/herkese açık bir dosya sunucusu değildir.
 */
export const GET = withApiHandler(
  async ({ ctx, params }) => {
    const result = await getContractSignedFileTool(ctx, { contractId: params.contractId });
    if (!result.ok) return result;
    const buffer = Buffer.from(result.data.fileData, "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": result.data.fileMimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${result.data.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  },
  { permission: "contracts:read" }
);
