import { withApiHandler } from "@/lib/api/handler";
import { listLessonsTool } from "@/lib/services/admin-lists";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/lessons?from=&to= — admin Program sekmesi (gün aralığı,
 * maks 62 gün). Yalnız SCHOOL_ADMIN/SUPER_ADMIN.
 */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) =>
    listLessonsTool(ctx, {
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
    }),
  { permission: "students:read" }
);
