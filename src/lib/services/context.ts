/**
 * Caller identity for authorization.
 * Roles align with production RBAC (JWT claims).
 */

import type { AppRole } from "../auth/types";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { hasActiveStudentAccess } from "../student-portal-access";

export type ActorRole = AppRole;

export type ServiceContext = {
  role: ActorRole;
  userId: string;
  /** Always from JWT (or trusted web session) — never from client spoof */
  tenantId: string;
  teacherId?: string;
  studentId?: string;
  channel?: "web" | "mobile" | "chat" | "whatsapp" | "voice" | "mcp";
  requestId?: string;
};

/**
 * @deprecated UI must use session JWT context (Milestone 5).
 * Kept only for non-UI scripts / tests.
 */
export const WEB_ADMIN_CONTEXT: ServiceContext = {
  role: "SCHOOL_ADMIN",
  userId: "web_admin",
  tenantId: DEFAULT_TENANT_ID,
  channel: "web",
};

const STAFF: AppRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "AI_AGENT"];

export function requireRole(
  ctx: ServiceContext,
  allowed: ActorRole[]
): { ok: true } | { ok: false; message: string } {
  if (allowed.includes(ctx.role)) {
    return { ok: true };
  }
  // SUPER_ADMIN bypasses role gates
  if (ctx.role === "SUPER_ADMIN") {
    return { ok: true };
  }
  return {
    ok: false,
    message: `Role '${ctx.role}' is not allowed. Need one of: ${allowed.join(", ")}`,
  };
}

/**
 * Öğrenci erişim matrisi.
 *
 * TEACHER için sahiplik (`ownership.teacherId === ctx.teacherId`) ZORUNLUDUR.
 * ownership verilmezse fail-closed `false` — IDOR'u kapatır. STUDENT rolü
 * (Karma Öğrenci Portalı) için erişim ARTIK `ctx.studentId` karşılaştırması
 * DEĞİL — her istekte `StudentPortalAccess(tenantId, userId, studentId,
 * status=active)` async doğrulanır; hem GUARDIAN hem SELF accessType kabul
 * edilir. Sonuç JWT'de veya request-scope dışında hiçbir yerde
 * cache'lenmez — bir erişim iptali bir sonraki istekte hemen etkilidir.
 * Tool/API katmanı öğrenciyi yükledikten sonra
 * `await canAccessStudent(ctx, id, { teacherId })` veya
 * `await assertStudentAccess` kullanmalıdır.
 */
export async function canAccessStudent(
  ctx: ServiceContext,
  studentId: string,
  ownership?: { teacherId: string }
): Promise<boolean> {
  if (ctx.role === "SUPER_ADMIN" || ctx.role === "SCHOOL_ADMIN" || ctx.role === "AI_AGENT") {
    return true;
  }
  if (ctx.role === "STUDENT") {
    return hasActiveStudentAccess(ctx.tenantId, ctx.userId, studentId);
  }
  if (ctx.role === "TEACHER") {
    if (!ctx.teacherId) return false;
    if (!ownership) return false;
    return ownership.teacherId === ctx.teacherId;
  }
  return false;
}

/**
 * Tek giriş noktası: kayıt yoksa NOT_FOUND benzeri mesaj, sahiplik yoksa
 * FORBIDDEN. UI'daki `findOwnStudent` ile aynı kural tool/API'de.
 */
export async function assertStudentAccess(
  ctx: ServiceContext,
  student: { id: string; teacherId: string } | undefined | null,
  studentId: string
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; message: string }> {
  if (!student || student.id !== studentId) {
    return { ok: false, code: "NOT_FOUND", message: "Öğrenci bulunamadı" };
  }
  if (!(await canAccessStudent(ctx, studentId, { teacherId: student.teacherId }))) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message:
        ctx.role === "TEACHER"
          ? "Yalnızca kendi öğrencinize erişebilirsiniz."
          : "Bu öğrenciye erişiminiz yok",
    };
  }
  return { ok: true };
}

export function canAccessTeacher(ctx: ServiceContext, teacherId: string): boolean {
  if (ctx.role === "SUPER_ADMIN" || ctx.role === "SCHOOL_ADMIN" || ctx.role === "AI_AGENT") {
    return true;
  }
  if (ctx.role === "TEACHER") return ctx.teacherId === teacherId;
  return false;
}

export function isStaff(ctx: ServiceContext): boolean {
  return STAFF.includes(ctx.role);
}
