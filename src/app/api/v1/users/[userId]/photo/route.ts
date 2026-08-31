import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { getProfilePhotoTool, uploadProfilePhotoTool, deleteProfilePhotoTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET/POST/DELETE /api/v1/users/:userId/photo — Student/Teacher gibi ayrı bir
 * domain kaydı olmayan roller (veli, admin) için KENDİ profil fotoğrafı. Bkz.
 * students/:studentId/photo ile AYNI desen; tek fark ownerType "user" ve
 * ownerId her zaman bir User.id.
 */
export const GET = withApiHandler(
  async ({ ctx, params }) => {
    const result = await getProfilePhotoTool(ctx, { ownerType: "user", ownerId: params.userId });
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
      ownerType: "user",
      ownerId: params.userId,
    }),
  { permission: "profile_photo:write" }
);

export const DELETE = withApiHandler(
  async ({ ctx, params }) => deleteProfilePhotoTool(ctx, { ownerType: "user", ownerId: params.userId }),
  { permission: "profile_photo:write" }
);
