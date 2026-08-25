import type { AppRole } from "./types";

/**
 * Permission catalog — endpoint / capability level.
 * Tools also enforce roles; this is the API gate.
 */
export type Permission =
  | "attendance:write"
  | "makeup:read"
  | "makeup:write"
  | "teachers:read"
  | "teachers:write"
  | "students:read"
  | "students:write"
  | "payments:write"
  | "payments:checkout"
  | "messages:send"
  | "tools:catalog"
  | "demo:reset"
  | "tenant:all"
  | "export:institution"
  | "notifications:read"
  | "communication:write"
  | "announcements:read"
  | "announcements:write"
  | "assessments:read"
  | "assessments:write"
  | "availability:propose"
  | "availability:review"
  | "homework:read"
  | "homework:write"
  | "homework:submit"
  | "materials:read"
  | "materials:write"
  | "teacher_feedback:submit"
  | "teacher_feedback:read"
  | "teacher_feedback:summary"
  | "student_feedback:submit"
  | "student_feedback:read"
  | "curriculum:read"
  | "curriculum:write"
  | "pii:full"
  | "documents:read"
  | "documents:write"
  | "trials:read"
  | "trials:write"
  | "workflows:manage"
  | "crm:read"
  | "crm:write";

const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  SUPER_ADMIN: [
    "attendance:write",
    "makeup:read",
    "makeup:write",
    "teachers:read",
    "teachers:write",
    "students:read",
    "students:write",
    "payments:write",
    "payments:checkout",
    "messages:send",
    "tools:catalog",
    "demo:reset",
    "tenant:all",
    "export:institution",
    "notifications:read",
    "communication:write",
    "announcements:read",
    "announcements:write",
    "assessments:read",
    "assessments:write",
    "availability:review",
    "homework:read",
    "materials:read",
    "teacher_feedback:read",
    "student_feedback:read",
    "curriculum:read",
    "curriculum:write",
    "pii:full",
    "documents:read",
    "documents:write",
    "trials:read",
    "trials:write",
    "workflows:manage",
    "crm:read",
    "crm:write",
  ],
  SCHOOL_ADMIN: [
    "attendance:write",
    "makeup:read",
    "makeup:write",
    "teachers:read",
    "teachers:write",
    "students:read",
    "students:write",
    "payments:write",
    "payments:checkout",
    "messages:send",
    "tools:catalog",
    "demo:reset",
    "export:institution",
    "notifications:read",
    "communication:write",
    "announcements:read",
    "announcements:write",
    "assessments:read",
    "assessments:write",
    "availability:review",
    "homework:read",
    "materials:read",
    "teacher_feedback:read",
    "student_feedback:read",
    "curriculum:read",
    "curriculum:write",
    "pii:full",
    "documents:read",
    "documents:write",
    "trials:read",
    "trials:write",
    "workflows:manage",
    "crm:read",
    "crm:write",
  ],
  TEACHER: [
    "attendance:write",
    "makeup:read",
    "makeup:write",
    "teachers:read",
    "students:read",
    "messages:send",
    "tools:catalog",
    "notifications:read",
    "announcements:read",
    "assessments:read",
    "assessments:write",
    "availability:propose",
    "homework:read",
    "homework:write",
    "materials:read",
    "materials:write",
    "curriculum:read",
    "curriculum:write",
    "documents:read",
    "trials:read",
    "trials:write",
    "teacher_feedback:summary",
    "student_feedback:submit",
    "student_feedback:read",
  ],
  /**
   * Karma Öğrenci Portalı — eski PARENT rolünün izinleri buraya birleştirildi
   * (communication:write dahil), çünkü veli/öğrenci ayrımı artık bir rol değil,
   * StudentPortalAccess.accessType ("GUARDIAN" | "SELF"). Rol düzeyinde tek bir
   * izin seti; GUARDIAN'a özgü kısıtlar (varsa) tool katmanında, accessType
   * kontrolü üzerinden uygulanır — bkz. src/lib/services/context.ts.
   * EPIC 6A — bilinçli olarak dar bir izin seti: yalnızca kendi/erişimli
   * öğrencinin verisini OKUR (canAccessStudent ile kapsamlanır). EPIC 6B/6C ile
   * İKİ dar YAZMA izni eklendi: kendi ödev teslimini yükleme ve öğretmen
   * hakkında geri bildirim — ikisi de yalnızca erişimli kayda, tool katmanında
   * ayrıca kapsamlanır.
   */
  STUDENT: [
    "students:read",
    "tools:catalog",
    "notifications:read",
    "communication:write",
    "announcements:read",
    "assessments:read",
    "homework:read",
    "homework:submit",
    "materials:read",
    "teacher_feedback:submit",
    "curriculum:read",
    "documents:read",
    "payments:checkout",
  ],
  AI_AGENT: [
    "attendance:write",
    "makeup:read",
    "makeup:write",
    "teachers:read",
    "teachers:write",
    "students:read",
    "students:write",
    "payments:write",
    "payments:checkout",
    "messages:send",
    "tools:catalog",
    "notifications:read",
    "communication:write",
    "announcements:read",
    "assessments:read",
    "curriculum:read",
  ],
};

export function hasPermission(role: AppRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function assertPermission(
  role: AppRole,
  permission: Permission
): { ok: true } | { ok: false; message: string } {
  if (hasPermission(role, permission)) return { ok: true };
  return {
    ok: false,
    message: `Role ${role} lacks permission ${permission}`,
  };
}
