import { withApiHandler } from "@/lib/api/handler";
import { listTeacherStudentsTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/teachers/:teacherId/students — öğretmenin kendi öğrenci listesi (mobil "Öğrencilerim"). */
export const GET = withApiHandler(
  async ({ ctx, params }) => listTeacherStudentsTool(ctx, { teacherId: params.teacherId }),
  { permission: "teachers:read" }
);
