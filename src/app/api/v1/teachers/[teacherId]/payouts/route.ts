import { withApiHandler } from "@/lib/api/handler";
import { listTeacherPayoutsTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/teachers/:teacherId/payouts — öğretmenin kendi hakediş kayıtları (mobil "Hakedişlerim"). */
export const GET = withApiHandler(
  async ({ ctx, params }) => listTeacherPayoutsTool(ctx, { teacherId: params.teacherId }),
  { permission: "teachers:read" }
);
