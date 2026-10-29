import { withApiHandler } from "@/lib/api/handler";
import { createTeacherTool } from "@/lib/services";
import { listTeachersTool } from "@/lib/services/admin-lists";

export const dynamic = "force-dynamic";

/** POST /api/v1/teachers */
export const POST = withApiHandler(
  async ({ ctx, body }) => createTeacherTool(ctx, body),
  { permission: "teachers:write" }
);

/**
 * GET /api/v1/teachers?q=&active=&limit=&offset= — Kişiler + Program
 * öğretmen filtresi + değerlendirme imza adı. TEACHER yalnız kendi kaydını
 * görür (PII minimizasyonu); STUDENT fail-closed.
 */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) =>
    listTeachersTool(ctx, {
      q: searchParams.get("q") || undefined,
      active: searchParams.get("active") || undefined,
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
    }),
  { permission: "teachers:read" }
);
