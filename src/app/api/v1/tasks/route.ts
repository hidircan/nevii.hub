import { withApiHandler } from "@/lib/api/handler";
import { listTasksTool, createTaskTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/tasks?quickFilter=&status=&status=&... — bkz. listTasksFilterSchema.
 * `status` tekrarlanan query param olarak gelir (URLSearchParams.getAll).
 * Rol bazlı kapsamlama (TEACHER yalnızca kendi görevleri) tool katmanında.
 */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) => {
    const status = searchParams.getAll("status");
    return listTasksTool(ctx, {
      status: status.length > 0 ? status : undefined,
      priority: searchParams.get("priority") || undefined,
      category: searchParams.get("category") || undefined,
      assigneeId: searchParams.get("assigneeId") || undefined,
      followerId: searchParams.get("followerId") || undefined,
      branchId: searchParams.get("branchId") || undefined,
      createdById: searchParams.get("createdById") || undefined,
      tag: searchParams.get("tag") || undefined,
      search: searchParams.get("search") || undefined,
      dueBefore: searchParams.get("dueBefore") || undefined,
      dueAfter: searchParams.get("dueAfter") || undefined,
      quickFilter: searchParams.get("quickFilter") || undefined,
    });
  },
  { permission: "tasks:read" }
);

/** POST /api/v1/tasks — bkz. createTaskSchema. TEACHER yalnızca erişebildiği bir kayda bağlı görev oluşturabilir (tool katmanı). */
export const POST = withApiHandler(async ({ ctx, body }) => createTaskTool(ctx, body), { permission: "tasks:write" });
