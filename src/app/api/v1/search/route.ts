import { withApiHandler } from "@/lib/api/handler";
import { globalSearchTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/search?q=... — panel command palette'in varlık araması.
 * `students:read` gate — tüm panel rolleri (SCHOOL_ADMIN/SUPER_ADMIN/TEACHER/
 * AI_AGENT) sahip; kategori bazlı ek RBAC (öğretmen kendi öğrencileri, personel
 * yalnız admin) `globalSearchTool` içinde uygulanır.
 */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) => globalSearchTool(ctx, { query: searchParams.get("q") || "" }),
  { permission: "students:read" }
);
