import type { AppRole } from "./types";

/** Kullanıcı menüsü/hesap sayfası için Türkçe rol etiketleri — yalnızca görsel, RBAC'ı etkilemez. */
export const ROLE_LABELS_TR: Record<AppRole, string> = {
  HYPER_ADMIN: "Platform Yöneticisi",
  SUPER_ADMIN: "Kurum Sahibi",
  SCHOOL_ADMIN: "Kurum Yöneticisi",
  BRANCH_MANAGER: "Şube Müdürü",
  TEACHER: "Öğretmen",
  STUDENT: "Öğrenci",
  AI_AGENT: "Yapay Zekâ Ajanı",
};

export function roleLabelTr(role: AppRole): string {
  return ROLE_LABELS_TR[role] ?? role;
}

/** "nilufer.acar@..." → "NA" — gerçek ad/soyad alanı olmadığında sade bir monogram üretir. */
export function initialsFromEmail(email: string | undefined | null, fallback: string): string {
  if (!email) return fallback.slice(0, 2).toUpperCase();
  const local = email.split("@")[0] ?? "";
  const segments = local.split(/[._-]+/).filter(Boolean);
  if (segments.length === 0) return fallback.slice(0, 2).toUpperCase();
  const initials = segments
    .slice(0, 2)
    .map((s) => s.charAt(0))
    .join("");
  return (initials || fallback.slice(0, 2)).toUpperCase();
}
