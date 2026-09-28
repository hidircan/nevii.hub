/**
 * Backend rolleri (src/lib/auth/types.ts APP_ROLES). PARENT login rolü YOKTUR
 * (Karma Öğrenci Portalı): veli = STUDENT + StudentPortalAccess.accessType
 * "GUARDIAN". Veli kontrolü `user.role` ile değil `personaOf(user)` ile yapılır.
 */
export type AppRole =
  | "HYPER_ADMIN"
  | "SUPER_ADMIN"
  | "SCHOOL_ADMIN"
  | "BRANCH_MANAGER"
  | "TEACHER"
  | "STUDENT"
  | "AI_AGENT";

export type PortalAccessType = "GUARDIAN" | "SELF";
export type MobilePersona = "admin" | "teacher" | "student" | "parent";
export type UnsupportedReason = "platform_web" | "manager_web" | "no_portal_access" | "no_mobile_persona";
export type PersonaResolution =
  | { kind: "persona"; persona: MobilePersona }
  | { kind: "unsupported"; reason: UnsupportedReason };

/** GET /api/v1/mobile/session yanıtındaki persona girdileri — YALNIZ sunucudan gelir. */
export type SessionFacts = { role: string; loginRole?: string | null; portalAccessType?: string | null };

const persona = (p: MobilePersona): PersonaResolution => ({ kind: "persona", persona: p });
const unsupported = (reason: UnsupportedReason): PersonaResolution => ({ kind: "unsupported", reason });

/**
 * Sunucu oturum gerçeklerinden mobil persona'yı çözer. Yalnız routing/UX içindir —
 * yetki kararı her istekte sunucuda verilir; istemci rol yükseltmez, tenant/şube
 * kapsamı hesaplamaz. Bilinmeyen her durum fail-closed "unsupported"a düşer.
 *
 * - HYPER_ADMIN: platform hesabı, mobil kurum portalı yok → web.
 * - BRANCH_MANAGER: login role'e bakılır — "unified" preset'te efektif rol
 *   SCHOOL_ADMIN olsa bile 1 Ekim öncesi mobil yönetici portalına açılmaz.
 * - STUDENT: accessType SELF → student, GUARDIAN → parent (veli); aktif erişim
 *   kaydı yoksa sessizce student'a birleştirilmez.
 */
export function resolveMobilePersona(s: SessionFacts): PersonaResolution {
  const loginRole = s.loginRole ?? s.role;
  if (loginRole === "HYPER_ADMIN" || s.role === "HYPER_ADMIN") return unsupported("platform_web");
  if (loginRole === "BRANCH_MANAGER" || s.role === "BRANCH_MANAGER") return unsupported("manager_web");
  switch (s.role) {
    case "SUPER_ADMIN":
    case "SCHOOL_ADMIN":
      return persona("admin");
    case "TEACHER":
      return persona("teacher");
    case "STUDENT":
      if (s.portalAccessType === "SELF") return persona("student");
      if (s.portalAccessType === "GUARDIAN") return persona("parent");
      return unsupported("no_portal_access");
    default:
      return unsupported("no_mobile_persona");
  }
}

/**
 * Desteklenmeyen hesap ekranının metni ve web'de açılacak yol (API_BASE_URL
 * ile aynı sunucu). Metinler `gate.*` sözlüğündedir; bu tablo yalnız
 * anahtar + web yolu taşır.
 */
export const UNSUPPORTED_COPY: Record<UnsupportedReason, { titleKey: string; bodyKey: string; webPath: string }> = {
  platform_web: { titleKey: "gate.platformTitle", bodyKey: "gate.platformBody", webPath: "/platform" },
  manager_web: { titleKey: "gate.managerTitle", bodyKey: "gate.managerBody", webPath: "/panel" },
  no_portal_access: { titleKey: "gate.noAccessTitle", bodyKey: "gate.noAccessBody", webPath: "/login" },
  no_mobile_persona: { titleKey: "gate.unknownTitle", bodyKey: "gate.unknownBody", webPath: "/login" },
};

/** Aktif dile göre çözülmüş desteklenmeyen-hesap metni. */
export function unsupportedCopy(
  reason: UnsupportedReason,
  tr: (path: string) => string,
): { title: string; body: string; webPath: string } {
  const entry = UNSUPPORTED_COPY[reason];
  return { title: tr(entry.titleKey), body: tr(entry.bodyKey), webPath: entry.webPath };
}
