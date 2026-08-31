export type AppRole = "SUPER_ADMIN" | "SCHOOL_ADMIN" | "TEACHER" | "PARENT" | "STUDENT" | "AI_AGENT";

/**
 * Backend'de PARENT (veli hesabı) ve STUDENT (öğrencinin kendi girişi) ayrı,
 * gerçek roller (src/lib/auth/types.ts APP_ROLES) — web tarafı da bunları
 * yalnızca `session.role` ile ayırıyor (src/app/veli/page.tsx ↔
 * src/app/ogrenci/page.tsx, ayrı bir "accessType" alanı YOK, ikisi de aynı
 * şekilde JWT'de `studentId` claim'i taşır). Mobil de aynı ayrımı birebir
 * uygular — STUDENT ve PARENT farklı persona/sekme grubuna gider.
 *
 * Bağımsız, RN'siz bir dosyada tutulur ki (auth-context.tsx aksine) düz
 * `vitest` ile, React Native runtime'ı mock'lamadan test edilebilsin.
 */
export function roleToPersona(role: AppRole): "admin" | "teacher" | "parent" | "student" {
  if (role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN") return "admin";
  if (role === "TEACHER") return "teacher";
  if (role === "STUDENT") return "student";
  return "parent";
}
