import { fail, ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import { readData } from "../store";
import { listBranchAccess } from "./store";

export type BranchScope = { mode: "tenant" } | { mode: "branches"; branchIds: string[] };

export const NO_BRANCH_SCOPE_MESSAGE = "Size atanmış aktif şube yok. NeviiOS yöneticinizden şube erişimi isteyin.";

/**
 * Server-side şube kapsamı. Kurum geneli roller → tenant; BRANCH_MANAGER →
 * yalnız aktif UserBranchAccess şubeleri. Atama yoksa FORBIDDEN (fail-closed)
 * — asla kurum geneline düşülmez. Diğer roller (öğretmen/öğrenci/platform)
 * bu kapsamı kullanamaz.
 */
export async function resolveBranchScope(ctx: ServiceContext): Promise<ServiceResult<BranchScope>> {
  if (ctx.role === "SUPER_ADMIN" || ctx.role === "SCHOOL_ADMIN") return ok({ mode: "tenant" });
  if (ctx.role !== "BRANCH_MANAGER") return fail("FORBIDDEN", "Bu rol şube kapsamı kullanamaz.");
  const rows = await listBranchAccess(ctx.tenantId, ctx.userId);
  const branchIds = [...new Set(rows.map((r) => r.branchId))];
  if (branchIds.length === 0) return fail("FORBIDDEN", NO_BRANCH_SCOPE_MESSAGE);
  return ok({ mode: "branches", branchIds });
}

export function inBranchScope(scope: BranchScope, branchId: string | undefined | null): boolean {
  if (scope.mode === "tenant") return true;
  return Boolean(branchId) && scope.branchIds.includes(branchId!);
}

/** Kurum geneli finans/aggregate: yalnız kurum sahibi (+ legacy kurum yöneticisi). Şube müdürü ASLA. */
export function canSeeInstitutionFinance(role: ServiceContext["role"]): boolean {
  return role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN";
}

/**
 * `/sube` portalının tek veri kaynağı. Tenant ALS'den (oturum) gelir; her
 * koleksiyon şube kapsamıyla süzülür. Ödeme/finans alanları döndürülmez.
 */
export async function getBranchManagerOverview(ctx: ServiceContext) {
  const scope = await resolveBranchScope(ctx);
  if (!scope.ok) return scope;
  if (scope.data.mode !== "branches") return fail("FORBIDDEN", "Bu görünüm yalnız şube müdürü içindir.");
  const s = scope.data;
  const data = await readData();
  const teachers = data.teachers.filter(
    (t) => inBranchScope(s, t.branchId) || (t.branchIds ?? []).some((b) => inBranchScope(s, b))
  );
  const now = Date.now();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
  const studentName = new Map(data.students.map((st) => [st.id, st.name]));
  const teacherName = new Map(data.teachers.map((t) => [t.id, t.name]));
  return ok({
    branches: data.settings.branches.filter((b) => inBranchScope(s, b.id)).map((b) => ({ id: b.id, name: b.name })),
    students: data.students
      .filter((st) => inBranchScope(s, st.branchId) && st.active !== false)
      .map((st) => ({ id: st.id, name: st.name, branchId: st.branchId, teacherId: st.teacherId, phone: st.phone, level: st.level ?? "" })),
    teachers: teachers.map((t) => ({ id: t.id, name: t.name })),
    upcomingLessons: data.lessons
      .filter((l) => {
        const t = new Date(l.startAt).getTime();
        return inBranchScope(s, l.branchId) && t >= dayStart.getTime() && t <= weekAhead && l.status !== "cancelled";
      })
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .slice(0, 50)
      .map((l) => ({
        id: l.id,
        startAt: l.startAt,
        branchId: l.branchId,
        studentId: l.studentId,
        studentName: studentName.get(l.studentId) ?? l.studentId,
        teacherName: teacherName.get(l.teacherId) ?? l.teacherId,
        status: l.status,
        attended: l.studentAttended ?? null,
      })),
    openMakeups: data.makeupRequests
      .filter((m) => inBranchScope(s, m.branchId) && (m.status === "pending" || m.status === "suggested"))
      .slice(0, 30)
      .map((m) => ({ id: m.id, studentName: studentName.get(m.studentId) ?? m.studentId, status: m.status, branchId: m.branchId })),
  });
}
