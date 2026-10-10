import { withApiHandler } from "@/lib/api/handler";
import { listStudentDocumentsTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/students/:studentId/documents — öğrencinin evrakları
 * (dosya baytı YOK, yalnız metadata). Sahiplik `assertStudentAccess` ile
 * tool katmanında (admin tümü, öğretmen kendi öğrencisi, veli/öğrenci
 * kendi erişimli kaydı).
 */
export const GET = withApiHandler(
  async ({ ctx, params }) => listStudentDocumentsTool(ctx, { studentId: params.studentId }),
  { permission: "documents:read" }
);
