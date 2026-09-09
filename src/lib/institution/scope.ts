import type { AppRole } from "../auth/types";

/**
 * "Kurum" bu projede Tenant'ın karşılığıdır (bkz. PROJECT.md §10 — Tenant
 * "top-level multi-tenant boundary"; School her tenant'a 1:1 bağlıdır ve
 * yalnızca o kurumun profil/ayar kaydını tutar). Branch ise mevcut "Şube"
 * kavramıdır ve bu sprintte dokunulmaz — kurum filtresi şubeden bağımsız,
 * bir üst kapsam olarak eklenir.
 */
export type KurumSummary = { tenantId: string; name: string };

export type InstitutionScope =
  | { mode: "single"; tenantId: string }
  | { mode: "all"; tenantIds: string[] };

export const KURUM_COOKIE = "notaplan_kurum";
/** "Tüm kurumlar" seçimini temsil eden cookie/parametre değeri. */
export const ALL_KURUMLAR = "ALL";

/**
 * Bir tercih (cookie'den okunan) geçerli mi ve hangi kurum seçili olmalı —
 * saf karar fonksiyonu. Kurum müdürü (SCHOOL_ADMIN) varsayılan olarak kendi
 * kurumunu görür; kurum sahibi (SUPER_ADMIN, platformun tüm kurumlarından
 * sorumlu) varsayılan olarak "Tüm kurumlar" görür. Geçersiz/erişilemeyen bir
 * tercih sessizce varsayılana döner.
 */
export function pickInstitutionSelection(
  role: AppRole,
  ownTenantId: string,
  available: KurumSummary[],
  requested: string | undefined,
  options?: { canSeeAllKurumlar?: boolean }
): string {
  const canSeeAll = options?.canSeeAllKurumlar ?? role === "SUPER_ADMIN";
  const isValid = (id: string) =>
    id === ALL_KURUMLAR ? canSeeAll : available.some((k) => k.tenantId === id);

  if (requested && isValid(requested)) return requested;
  return canSeeAll ? ALL_KURUMLAR : ownTenantId;
}

/** Seçilen değeri okuma kapsamına (tek kurum ya da tüm kurumların birleşimi) çevirir. */
export function scopeFromSelection(selection: string, available: KurumSummary[]): InstitutionScope {
  if (selection === ALL_KURUMLAR) {
    return { mode: "all", tenantIds: available.map((k) => k.tenantId) };
  }
  return { mode: "single", tenantId: selection };
}
