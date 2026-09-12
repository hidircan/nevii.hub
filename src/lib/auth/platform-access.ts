/**
 * Merkezi erişim sözleşmesi (2026-09-12 owner kararı — NeviiOS birleşimi).
 *
 * - HYPER_ADMIN: platform sahibi (`/platform/*`, tenantlar arası görünüm).
 * - SUPER_ADMIN: kurum sahibi — yalnız kendi tenant'ı; personel/özlük/bordro/
 *   izin/avans/IBAN/gider/bütçe/finans özeti YALNIZ bu roldedir.
 * - SCHOOL_ADMIN: kurum yöneticisi — günlük operasyon, hassas alan YOK.
 * - BRANCH_MANAGER: şube yöneticisi; `unified` preset'te efektif rolü
 *   SCHOOL_ADMIN olur (bkz. platform/manager-preset.ts) — hassas alan YOK.
 *
 * Kararlar yalnız ROL ile verilir (userId listesi yok). `role` her zaman
 * efektif roldür (ServiceContext.role); giriş rolü `loginRole`'dadır.
 */

import type { AppRole } from "./types";

export type AccessActor = {
  userId: string;
  role: AppRole;
  email?: string;
  tenantId?: string;
};

/** Demo/bootstrap kurum sahibi — Nilüfer Acar (SUPER_ADMIN; erişim yalnız rolden gelir). */
export const INSTITUTION_OWNER_USER_ID = "user_owner_nilufer";

/** Demo/bootstrap kurum yöneticisi — Ezgi Güçlü. */
export const INSTITUTION_MANAGER_USER_ID = "user_manager_ezgi";

export function isPlatformOwner(actor: AccessActor): boolean {
  return actor.role === "HYPER_ADMIN";
}

export function isInstitutionOwner(actor: AccessActor): boolean {
  return actor.role === "SUPER_ADMIN";
}

/** Personel/özlük/bordro/izin/avans/IBAN/gider/bütçe/finans özeti — yalnız kurum sahibi. */
export function canViewFinanceAndStaffSummary(actor: AccessActor): boolean {
  return isInstitutionOwner(actor);
}

/** Kurumlar arası geçiş / "Tüm kurumlar" — yalnız platform sahibi. */
export function canSeeAllKurumlar(actor: AccessActor): boolean {
  return isPlatformOwner(actor);
}
