import { withApiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/services/result";
import { resolveActivePortalAccess } from "@/lib/student-portal-access";

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
    // STUDENT: öğrenci/persona YALNIZ aktif StudentPortalAccess'ten çözülür (veli
    // hesabında JWT studentId boştur); aktif erişim yoksa studentId de verilmez.
    const access =
      ctx.role === "STUDENT" ? await resolveActivePortalAccess(ctx.tenantId, ctx.userId, ctx.studentId) : null;
    return ok({
      userId: ctx.userId,
      role: ctx.role,
      loginRole: ctx.loginRole ?? ctx.role,
      tenantId: ctx.tenantId,
      teacherId: ctx.teacherId,
      studentId: ctx.role === "STUDENT" ? access?.studentId : ctx.studentId,
      portalAccessType: access?.accessType ?? null,
    });
  },
  { allowBranchManager: true }
);
