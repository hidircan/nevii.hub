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
  | "billing:read"
  | "billing:write"
  | "messages:send"
  | "tools:catalog"
  /** AI asistan sohbeti: yalnız yöneticiler (öğretmen/öğrenci portalında asistan yok). */
  | "ai:chat"
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
  | "crm:write"
  | "profile_photo:read"
  | "profile_photo:write"
  | "tasks:read"
  | "tasks:write"
  | "contracts:read"
  | "contracts:write"
  | "platform:read"
  | "platform:write"
  | "institution:settings"
  | "institution:features"
  | "institution:integrations";

const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  /**
   * NeviiHub platform sahibi. Kurum operasyon izinleri YOKTUR —
   * öğretmen/veli/öğrenci gibi davranmaz. Cross-tenant yetki yalnız burada.
   */
  HYPER_ADMIN: [
    "tenant:all",
    "platform:read",
    "platform:write",
    "institution:settings",
    "institution:features",
    "institution:integrations",
    "tools:catalog",
    "ai:chat",
  ],
  /**
   * NeviiOS şube müdürü — fail-closed: yalnız tool katmanı şube filtresi
   * taşıyan izinler tek tek açılır. trials:write açıktır; updateTrialLessonTool
   * + updateTrialLessonStatusTool kaynak+hedef şubeyi UserBranchAccess
   * kapsamına karşı denetler (kapsam dışı = FORBIDDEN).
   */
  /**
   * Şube müdürü — dar kapsamlı operasyonel yazma: deneme revizyonu
   * (trials:write) + kendi şubelerinin evraklarını görüntüleme/arşivleme
   * (documents:* — tool katmanında şube kapsamına zorlanır, fail-closed).
   * Şablon yönetimi, evrak üretimi/yükleme ve silme (sürüm silme dahil)
   * tool katmanında SCHOOL_ADMIN/SUPER_ADMIN'e kilitli kalır.
   */
  BRANCH_MANAGER: ["trials:write", "documents:read", "documents:write"],
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
    "ai:chat",
    "demo:reset",
    "export:institution",
    "institution:settings",
    "institution:features",
    "institution:integrations",
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
    "profile_photo:read",
    "profile_photo:write",
    "tasks:read",
    "tasks:write",
    "contracts:read",
    "contracts:write",
    "billing:read",
    "billing:write",
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
    "ai:chat",
    "demo:reset",
    "export:institution",
    "institution:features",
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
    "profile_photo:read",
    "profile_photo:write",
    "tasks:read",
    "tasks:write",
    "contracts:read",
    "contracts:write",
    "billing:read",
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
    "profile_photo:read",
    "profile_photo:write",
    "tasks:read",
    "tasks:write",
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
    "profile_photo:read",
    "profile_photo:write",
    "contracts:read",
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

/** NeviiOS rol etki önizlemesi için — salt okunur kopya. */
export function permissionsForRole(role: AppRole): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

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
