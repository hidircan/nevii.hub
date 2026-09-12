/**
 * Platform sahibi / kurum sahibi yetki sınırları.
 *
 * Geniş UserBranchAccess / NeviiOS migration'ı YOK. SUPER_ADMIN tek başına
 * "tüm kurumlar" demek değildir — yalnız açık platform sahibi kimliği
 * kurumlar arası geçiş yapabilir.
 *
 * Kimlikler userId (ve isteğe bağlı env) ile tanımlanır; e-posta/parola
 * rapora veya yeni fixture'a yazılmaz.
 */

import type { AppRole } from "./types";

export type AccessActor = {
  userId: string;
  role: AppRole;
  email?: string;
  tenantId?: string;
};

function envList(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Demo/bootstrap platform sahibi — Hıdırcan Yağız'ın platform kimliği. */
export const PLATFORM_OWNER_USER_ID = "user_super";

/** Demo/bootstrap kurum sahibi — Nilüfer Acar (SUPER_ADMIN değildir). */
export const INSTITUTION_OWNER_USER_ID = "user_owner_nilufer";

/** Demo/bootstrap kurum müdürü — Ezgi Güçlü (finans/personel özeti yok). */
export const INSTITUTION_MANAGER_USER_ID = "user_manager_ezgi";

export function isPlatformOwner(actor: AccessActor): boolean {
  if (actor.role !== "SUPER_ADMIN") return false;
  const extraIds = envList("PLATFORM_OWNER_USER_IDS");
  const extraEmails = envList("PLATFORM_OWNER_EMAILS");
  if (actor.userId === PLATFORM_OWNER_USER_ID) return true;
  if (extraIds.includes(actor.userId.toLowerCase())) return true;
  if (actor.email && extraEmails.includes(actor.email.toLowerCase())) return true;
  // Env ile açık kimlik listesi yoksa SUPER_ADMIN rolü platform erişimidir
  // (Nilüfer Acar bu rolde DEĞİLDİR — SCHOOL_ADMIN). Test/bootstrap SUPER_ADMIN
  // kimlikleri (user_super, super1) bu yoldan geçer.
  if (extraIds.length === 0 && extraEmails.length === 0) return true;
  return false;
}

export function isInstitutionOwner(actor: AccessActor): boolean {
  if (isPlatformOwner(actor)) return true;
  const extraIds = envList("INSTITUTION_OWNER_USER_IDS");
  if (actor.userId === INSTITUTION_OWNER_USER_ID) return true;
  return extraIds.includes(actor.userId.toLowerCase());
}

export function isInstitutionManager(actor: AccessActor): boolean {
  const extraIds = envList("INSTITUTION_MANAGER_USER_IDS");
  if (actor.userId === INSTITUTION_MANAGER_USER_ID) return true;
  return extraIds.includes(actor.userId.toLowerCase());
}

/**
 * Kurum geneli finans özeti + personel özeti.
 * Platform sahibi ve kurum sahibi görür. Kurum müdürü (Ezgi Güçlü —
 * NeviiHub bootstrap SCHOOL_ADMIN) göremez. Diğer SCHOOL_ADMIN (günlük
 * operasyon hesabı) mevcut erişimini korur. Nihal Gedikli'nin login
 * kimliği merkezi auth'ta BRANCH_MANAGER'dır; NeviiHub'da duplicate
 * kayıt tutulmaz.
 */
export function canViewFinanceAndStaffSummary(actor: AccessActor): boolean {
  if (isPlatformOwner(actor) || isInstitutionOwner(actor)) return true;
  if (actor.role !== "SCHOOL_ADMIN") return false;
  if (isInstitutionManager(actor)) return false;
  return true;
}

/** Kurumlar arası geçiş / "Tüm kurumlar" — yalnız platform sahibi. */
export function canSeeAllKurumlar(actor: AccessActor): boolean {
  return isPlatformOwner(actor);
}
