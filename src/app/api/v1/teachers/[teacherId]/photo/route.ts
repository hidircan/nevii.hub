import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { getProfilePhotoTool, uploadProfilePhotoTool, deleteProfilePhotoTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET/POST/DELETE /api/v1/teachers/:teacherId/photo — bkz. students/:studentId/photo ile AYNI desen. */
export const GET = withApiHandler(
  async ({ ctx, params }) => {
    const result = await getProfilePhotoTool(ctx, { ownerType: "teacher", ownerId: params.teacherId });
    if (!result.ok) return result;
    if (!result.data) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Fotoğraf yok" } }, { status: 404 });
    }
    const buffer = Buffer.from(result.data.fileData, "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": result.data.fileMimeType,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  },
  { permission: "profile_photo:read" }
);

export const POST = withApiHandler(
  async ({ ctx, params, body }) =>
    uploadProfilePhotoTool(ctx, {
      ...(typeof body === "object" && body !== null ? body : {}),
      ownerType: "teacher",
      ownerId: params.teacherId,
    }),
  { permission: "profile_photo:write" }
);

export const DELETE = withApiHandler(
  async ({ ctx, params }) => deleteProfilePhotoTool(ctx, { ownerType: "teacher", ownerId: params.teacherId }),
  { permission: "profile_photo:write" }
);
