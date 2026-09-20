import type { AuthUser } from "../auth/auth-context";

/**
 * Sunucunun verdiği çocuk kaydı — `GET /api/v1/mobile/my-children`
 * (PII-minimize: id, displayName, accessType, photoPath, instruments,
 * teacherName). Liste boş/ulaşılamazsa tekil session `studentId` fallback'tır.
 */
export type ServerChild = {
  studentId: string;
  displayName?: string | null;
  photoPath?: string | null;
  detail?: string | null;
};

/**
 * Sunucu-otriteli çocuk listesi. TEK kaynak sunucudur: `my-children` yanıtı
 * doluysa o (çoklu destek), boş/ulaşılamazsa tekil session `studentId`
 * fallback. İstemcide ID üretilmez, URL parametresi ASLA otorite değildir.
 */
export function availableChildren(
  user: AuthUser | null | undefined,
  fetched: ServerChild[]
): ServerChild[] {
  const clean = fetched.filter(
    (c): c is ServerChild => !!c && typeof c.studentId === "string" && c.studentId.length > 0
  );
  if (clean.length > 0) {
    const seen = new Set<string>();
    return clean.filter((c) => (seen.has(c.studentId) ? false : (seen.add(c.studentId), true)));
  }
  if (!user) return [];
  return user.studentId ? [{ studentId: user.studentId }] : [];
}

export function availableChildIds(user: AuthUser | null | undefined, fetched: ServerChild[] = []): string[] {
  return availableChildren(user, fetched).map((c) => c.studentId);
}

/** Veli + birden fazla aktif çocuk — seçim ekranı/switcher yalnız bu durumda görünür. */
export function needsChildPicker(user: AuthUser | null | undefined, fetched: ServerChild[] = []): boolean {
  return user?.portalAccessType === "GUARDIAN" && availableChildIds(user, fetched).length > 1;
}

/**
 * Persist tercihi oturum listesine karşı doğrular. Listede yoksa (erişim
 * iptal/edilmiş çocuk) geçersiz sayılır — asla tahminle seçilmez.
 */
export function validatePersistedSelection(available: string[], stored: string | null): string | null {
  return stored && available.includes(stored) ? stored : null;
}
