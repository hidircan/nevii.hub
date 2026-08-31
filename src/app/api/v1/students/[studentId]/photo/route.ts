import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { getProfilePhotoTool, uploadProfilePhotoTool, deleteProfilePhotoTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET/POST/DELETE /api/v1/students/:studentId/photo — profil fotoğrafı.
 * Ham baytları YALNIZCA yetkili bir oturumla döner (bkz. homework/:id/file ile
 * AYNI desen) — ASLA parametresiz/herkese açık bir dosya sunucusu değildir.
 * Görüntüleme (GET) ile yönetme (POST/DELETE) YETKİLERİ FARKLIDIR — bkz.
 * tools.ts canManagePhoto (yalnızca sahibinin kendisi veya admin yönetebilir;
 * öğretmen yalnızca GÖRÜNTÜLER, yönetemez).
 */
export const GET = withApiHandler(
  async ({ ctx, params }) => {
    const result = await getProfilePhotoTool(ctx, { ownerType: "student", ownerId: params.studentId });
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
      ownerType: "student",
      ownerId: params.studentId,
    }),
  { permission: "profile_photo:write" }
);

export const DELETE = withApiHandler(
  async ({ ctx, params }) => deleteProfilePhotoTool(ctx, { ownerType: "student", ownerId: params.studentId }),
  { permission: "profile_photo:write" }
);
