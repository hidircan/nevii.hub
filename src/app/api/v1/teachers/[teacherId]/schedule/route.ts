import { withApiHandler } from "@/lib/api/handler";
import { getTeacherScheduleTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/teachers/:teacherId/schedule?from=&to=&limit= (limit varsayılan 500, maks 2000) */
export const GET = withApiHandler(
  async ({ ctx, params, searchParams }) =>
    getTeacherScheduleTool(ctx, {
      teacherId: params.teacherId,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    }),
  { permission: "teachers:read" }
);
