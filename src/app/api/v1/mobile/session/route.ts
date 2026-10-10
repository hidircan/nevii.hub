import { withApiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/services/result";
import { resolvePortalStudent } from "@/lib/portal-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mobile/session — mobil persona çözümü için sunucu gerçekleri (salt-okunur).
 * `/auth/me` yalnız efektif rolü döndürür; mobil BRANCH_MANAGER "unified"ı ve
 * veli (STUDENT + GUARDIAN) / öğrenci (SELF) ayrımını yapabilmek için login
 * rolünü ve aktif portal erişim türünü de ister. Kimlik/tenant yalnız token'dan;
 * yetki kararı her istekte ilgili route'ta verilir, bu uç yalnız bilgi verir.
 * BRANCH_MANAGER'a açıktır ki mobil güvenli "desteklenmiyor" ekranını gösterebilsin.
 *
 * 10. tur iş #1 — varsayılan `studentId` HER ZAMAN aktif erişimi olan AKTİF
 * bir öğrencidir (web portalıyla AYNI `resolvePortalStudent`). `?studentId=`
 * tercihi YALNIZCA aktif erişim + aktif öğrenci ise kabul edilir (sunucu
 * tarafında doğrulanır); pasif/geçersiz tercih yok sayılır, aktif
 * varsayılana düşülür. `students` kardeş listesidir: pasif kardeşler
 * `active: false` ile döner (mobil seçici bunları devre dışı gösterir).
 * `portalStatus: "passive-only"` ise YALNIZCA-pasif erişimi haber verir —
 * geriye uyumluluk için bu durumda eski alanlar (pasif studentId +
 * accessType) ESKİSİ GİBİ döner; yeni istemci `portalStatus`'e bakıp doğru
 * pasif ekranı gösterir.
 */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) => {
    if (ctx.role !== "STUDENT") {
      return ok({
        userId: ctx.userId,
        role: ctx.role,
        loginRole: ctx.loginRole ?? ctx.role,
        tenantId: ctx.tenantId,
        teacherId: ctx.teacherId,
        studentId: ctx.studentId,
        portalAccessType: null,
        portalStatus: "no-access",
        students: [],
      });
    }
    const preferred = searchParams.get("studentId")?.trim().slice(0, 128) || ctx.studentId || null;
    const resolved = await resolvePortalStudent(ctx.tenantId, ctx.userId, preferred);
    const passiveFallback = resolved.status === "passive-only" ? resolved.siblings[0] : undefined;
    return ok({
      userId: ctx.userId,
      role: ctx.role,
      loginRole: ctx.loginRole ?? ctx.role,
      tenantId: ctx.tenantId,
      teacherId: ctx.teacherId,
      studentId:
        resolved.status === "ok" ? resolved.studentId : (passiveFallback?.studentId ?? undefined),
      portalAccessType:
        resolved.status === "ok" ? resolved.accessType : (passiveFallback?.accessType ?? null),
      portalStatus: resolved.status,
      students: resolved.siblings.map((s) => ({
        studentId: s.studentId,
        name: s.name,
        active: s.active,
        accessType: s.accessType,
      })),
    });
  },
  { allowBranchManager: true }
);
