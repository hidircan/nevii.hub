import { withApiHandler } from "@/lib/api/handler";
import { bulkAssignCurriculumTopicsTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/curriculum/bulk-assign — TEACHER (kendi öğrencileri) /
 * SCHOOL_ADMIN / SUPER_ADMIN. tenantId/teacherId/createdBy istemciden asla
 * kabul edilmez, oturumdan (ctx) çözülür — bkz. bulkAssignCurriculumTopicsTool.
 */
export const POST = withApiHandler(
  async ({ ctx, body }) => bulkAssignCurriculumTopicsTool(ctx, body),
  { permission: "curriculum:write" }
);
