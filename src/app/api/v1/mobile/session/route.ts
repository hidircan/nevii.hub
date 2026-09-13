import { withApiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/services/result";
import { getActiveAccessType } from "@/lib/student-portal-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/session — mobil persona çözümü için sunucu gerçekleri (salt-okunur).
 * `/auth/me` yalnız efektif rolü döndürür; mobil BRANCH_MANAGER "unified"ı ve
 * veli (STUDENT + GUARDIAN) / öğrenci (SELF) ayrımını yapabilmek için login
 * rolünü ve aktif portal erişim türünü de ister. Kimlik/tenant yalnız token'dan;
 * yetki kararı her istekte ilgili route'ta verilir, bu uç yalnız bilgi verir.
 * BRANCH_MANAGER'a açıktır ki mobil güvenli "desteklenmiyor" ekranını gösterebilsin.
 */
export const GET = withApiHandler(
  async ({ ctx }) => {
    const portalAccessType =
      ctx.role === "STUDENT" && ctx.studentId
        ? await getActiveAccessType(ctx.tenantId, ctx.userId, ctx.studentId)
        : null;
    return ok({
      userId: ctx.userId,
      role: ctx.role,
      loginRole: ctx.loginRole ?? ctx.role,
      tenantId: ctx.tenantId,
      teacherId: ctx.teacherId,
      studentId: ctx.studentId,
      portalAccessType,
    });
  },
  { allowBranchManager: true }
);
