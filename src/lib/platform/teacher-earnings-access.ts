import { DEFAULT_TENANT_ID } from "../auth/config";
import type { AppRole } from "../auth/types";
import { fail, ok, type ServiceResult } from "../services/result";
import { resolveSetting } from "./resolve";

/**
 * Öğretmen Hakedişleri (hakediş, ücret kuralı, ödeme) erişim politikası —
 * owner kararı (2026-09-12). Kurum başına, sürümlü + audit'li bir ayardır
 * (`access.teacherEarningsAccess`); rol adına küresel hardcode DEĞİLDİR.
 *
 * - `owner_only`: yalnız kurum sahibi (SUPER_ADMIN).
 * - `school_admin` (platform varsayılanı = birleşim öncesi davranış): + SCHOOL_ADMIN.
 * - `school_admin_and_branch_manager`: + BRANCH_MANAGER — yalnız `unified`
 *   preset'te (efektif rol SCHOOL_ADMIN, kurum kapsamı). `branch_scoped`
 *   BRANCH_MANAGER için şube-filtreli hakediş yüzeyi YOK → fail-closed red.
 *
 * Bu genel finans yetkisi DEĞİLDİR: finans özeti, gider, bütçe, IBAN, avans,
 * bordro, personel özlüğü `requireStaffSensitiveAccess` (yalnız SUPER_ADMIN)
 * ile korunmaya devam eder. HYPER_ADMIN kurum hakedişine erişmez.
 */
export const TEACHER_EARNINGS_ACCESS_KEY = "access.teacherEarningsAccess";
export const TEACHER_EARNINGS_ACCESS_LEVELS = ["owner_only", "school_admin", "school_admin_and_branch_manager"] as const;
export type TeacherEarningsAccess = (typeof TEACHER_EARNINGS_ACCESS_LEVELS)[number];

/** Owner kararıyla açık ayar yokken kullanılan kurum değerleri (Nilüfer Acar Sanat Merkezi). */
export const OWNER_TEACHER_EARNINGS_DEFAULTS: ReadonlyMap<string, TeacherEarningsAccess> = new Map([
  [DEFAULT_TENANT_ID, "school_admin_and_branch_manager"],
]);

// ponytail: 5 sn süreç içi önbellek (manager-preset ile aynı TTL); ayar yazımı invalidate eder.
const TTL_MS = 5_000;
const cache = new Map<string, { at: number; level: TeacherEarningsAccess }>();

export function invalidateTeacherEarningsAccess(tenantId?: string) {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

function isLevel(v: unknown): v is TeacherEarningsAccess {
  return typeof v === "string" && (TEACHER_EARNINGS_ACCESS_LEVELS as readonly string[]).includes(v);
}

/** Çözüm: açık kurum ayarı → owner varsayılanı → platform varsayılanı. Okuma hatası → `owner_only` (dar). */
export async function resolveTeacherEarningsAccess(tenantId: string): Promise<TeacherEarningsAccess> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at <= TTL_MS) return hit.level;
  let level: TeacherEarningsAccess = "owner_only";
  try {
    const s = await resolveSetting({ tenantId }, TEACHER_EARNINGS_ACCESS_KEY);
    const ownerDefault = OWNER_TEACHER_EARNINGS_DEFAULTS.get(tenantId);
    if (s && s.sourceScope !== "platform" && isLevel(s.effectiveValue)) level = s.effectiveValue;
    else if (ownerDefault) level = ownerDefault;
    else if (s && isLevel(s.effectiveValue)) level = s.effectiveValue;
    else level = "school_admin";
  } catch {
    level = "owner_only";
  }
  cache.set(tenantId, { at: Date.now(), level });
  return level;
}

type EarningsActor = { role: AppRole; loginRole?: AppRole; tenantId: string };

/** Kurum yönetici yüzeyi (panel/araç) için hakediş erişimi. TEACHER'ın kendi hakedişi ayrı kuraldır. */
export async function canAccessTeacherEarnings(actor: EarningsActor): Promise<boolean> {
  if (actor.role === "SUPER_ADMIN") return true;
  if (actor.role !== "SCHOOL_ADMIN") return false; // HYPER_ADMIN, branch_scoped BRANCH_MANAGER, diğerleri
  const level = await resolveTeacherEarningsAccess(actor.tenantId);
  if (level === "owner_only") return false;
  // Efektif SCHOOL_ADMIN ama giriş rolü BRANCH_MANAGER (unified preset): kurum açıkça izin vermeli.
  if (actor.loginRole === "BRANCH_MANAGER") return level === "school_admin_and_branch_manager";
  return true;
}

export async function assertTeacherEarningsAccess(actor: EarningsActor): Promise<ServiceResult<true>> {
  if (await canAccessTeacherEarnings(actor)) return ok(true);
  return fail("FORBIDDEN", "Öğretmen hakedişleri bu kurumda rolünüze açık değil.");
}
