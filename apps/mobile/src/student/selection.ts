import type { AuthUser } from "../auth/auth-context";

/** Sunucunun verdiği çocuk kaydı — bugün `MobileSession.children` boştur
 *  (session tek `studentId` döner); backend liste endpoint'i onaylanınca dolar. */
export type ServerChild = { studentId: string };

/**
 * Sunucu-otriteli çocuk listesi. TEK kaynak oturumdur: önce
 * `user.children` (çoklu destek), yoksa tekil `user.studentId` fallback.
 * İstemcide ID üretilmez, URL parametresi ASLA otorite değildir.
 */
export function availableChildIds(user: AuthUser | null | undefined): string[] {
  if (!user) return [];
  const extra = Array.isArray(user.children)
    ? user.children.map((c) => c?.studentId).filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  if (extra.length > 0) return [...new Set(extra)];
  return user.studentId ? [user.studentId] : [];
}

/** Veli + birden fazla aktif çocuk — seçim ekranı/switcher yalnız bu durumda görünür. */
export function needsChildPicker(user: AuthUser | null | undefined): boolean {
  return user?.portalAccessType === "GUARDIAN" && availableChildIds(user).length > 1;
}

/**
 * Persist tercihi oturum listesine karşı doğrular. Listede yoksa (erişim
 * iptal/edilmiş çocuk) geçersiz sayılır — asla tahminle seçilmez.
 */
export function validatePersistedSelection(available: string[], stored: string | null): string | null {
  return stored && available.includes(stored) ? stored : null;
}
