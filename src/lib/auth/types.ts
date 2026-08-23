/** Production RBAC roles — shared by Web, Mobile, AI, Voice, WhatsApp, MCP */

/**
 * "PARENT" kaldırıldı (Karma Öğrenci Portalı) — veli/öğrenci ayrımı artık
 * bir AppRole değil, `StudentPortalAccess.accessType` ("GUARDIAN" | "SELF")
 * ile çözülüyor. Dış kullanıcıların TAMAMI (veli veya öğrenci) tek bir
 * "STUDENT" rolüyle giriş yapar; hangi öğrenci(ler)e hangi türde erişimi
 * olduğu her istekte StudentPortalAccess'ten async doğrulanır (bkz.
 * src/lib/services/context.ts canAccessStudent).
 */
export const APP_ROLES = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "TEACHER",
  "STUDENT",
  "AI_AGENT",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type TokenType = "access" | "refresh";

export type JwtClaims = {
  /** userId */
  sub: string;
  role: AppRole;
  /** tenant/school id — only source of tenant for API */
  tenantId: string;
  typ: TokenType;
  teacherId?: string;
  studentId?: string;
  email?: string;
  /** issued at / exp set by jose */
  iat?: number;
  exp?: number;
};

export type AuthUser = {
  userId: string;
  role: AppRole;
  tenantId: string;
  email?: string;
  teacherId?: string;
  studentId?: string;
};

export type AuditEvent = {
  action: string;
  requestId: string;
  userId?: string;
  tenantId?: string;
  role?: AppRole;
  path?: string;
  method?: string;
  outcome: "success" | "denied" | "error";
  meta?: Record<string, unknown>;
};
