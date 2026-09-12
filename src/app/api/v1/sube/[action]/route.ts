import { withApiHandler } from "@/lib/api/handler";
import { fail } from "@/lib/services/result";
import {
  confirmMakeupLessonTool,
  createAnnouncementTool,
  createLessonTool,
  createMakeupLessonTool,
  markAttendanceTool,
  updateLessonScheduleTool,
  updateStudentProfileTool,
} from "@/lib/services/tools";
import { getBranchManagerOverview } from "@/lib/platform/branch-scope";
import type { ServiceContext } from "@/lib/services/context";

export const dynamic = "force-dynamic";

/**
 * Şube müdürü operasyon uçları. Handler BRANCH_MANAGER'ı yalnız burada
 * geçirir (`allowBranchManager`); her araç matrix grant'ini + aktif şube
 * atamasını + hedef kaydın şubesini ayrıca doğrular (assertBranchOperation).
 */
const WRITE: Record<string, (ctx: ServiceContext, body: unknown) => Promise<unknown>> = {
  attendance: markAttendanceTool,
  students: updateStudentProfileTool,
  lessons: createLessonTool,
  "lesson-schedule": updateLessonScheduleTool,
  makeups: createMakeupLessonTool,
  "makeup-confirm": confirmMakeupLessonTool,
  announcements: createAnnouncementTool,
};

export const GET = withApiHandler(
  async ({ ctx, params }) => {
    if (ctx.role !== "BRANCH_MANAGER") return fail("FORBIDDEN", "Yalnız şube müdürü.");
    if (params.action !== "overview") return fail("NOT_FOUND", "Bilinmeyen şube işlemi");
    return getBranchManagerOverview(ctx);
  },
  { allowBranchManager: true }
);

export const POST = withApiHandler(
  async ({ ctx, params, body }) => {
    if (ctx.role !== "BRANCH_MANAGER") return fail("FORBIDDEN", "Yalnız şube müdürü.");
    const fn = WRITE[params.action ?? ""];
    if (!fn) return fail("NOT_FOUND", "Bilinmeyen şube işlemi");
    return fn(ctx, body) as ReturnType<typeof markAttendanceTool>;
  },
  { allowBranchManager: true }
);
