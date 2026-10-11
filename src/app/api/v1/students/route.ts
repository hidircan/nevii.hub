import { withApiHandler } from "@/lib/api/handler";
import { createStudentTool } from "@/lib/services";
import { listStudentsTool } from "@/lib/services/admin-lists";

export const dynamic = "force-dynamic";

/** POST /api/v1/students */
export const POST = withApiHandler(
  async ({ ctx, body }) => createStudentTool(ctx, body),
  { permission: "students:write" }
);

/**
 * GET /api/v1/students?q=&active=&limit=&offset= — admin P0 listeleri
 * (Kişiler, Yoklama araması, Tahsilat, Duyuru hedefleme). Rol kapısı
 * tool katmanındadır: admin tam liste, TEACHER yalnız kendi öğrencileri,
 * STUDENT fail-closed (kendi kaydı `my-children`/session akışındadır).
 */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) =>
    listStudentsTool(ctx, {
      q: searchParams.get("q") || undefined,
      active: searchParams.get("active") || undefined,
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
    }),
  { permission: "students:read" }
);
