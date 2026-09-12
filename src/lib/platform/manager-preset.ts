import { DEFAULT_TENANT_ID } from "../auth/config";
import type { AppRole } from "../auth/types";
import { resolveSetting } from "./resolve";
import { MANAGER_PRESETS, type ManagerPreset } from "./types";

/**
 * NeviiOS yönetici izin preset'i — owner kararı (2026-09-11):
 * Nilüfer Acar kurumunda SCHOOL_ADMIN ve BRANCH_MANAGER AYNI efektif izin
 * setine sahiptir (öğrenci, sözleşme, tahsilat, ücret, program, yoklama,
 * telafi). Rol adları birleştirilmez: preset kurum başına bir ayardır
 * (`access.managerPreset`) ve ileride "branch_scoped" yapılarak ayrıştırılır.
 *
 * Çözümleme sırası: açık kurum/paket ayarı → owner varsayılanı (aşağıdaki
 * kurum listesi = "unified") → platform varsayılanı ("branch_scoped").
 * Okuma hatasında dar olan "branch_scoped"a düşer (fail-closed).
 *
 * Efektif rol oturum bağlamı kurulurken (authenticateRequest /
 * getSessionContext) bir kez çözülür; böylece rbac.ts, tool `requireRole`,
 * panel layout ve server action kapıları TEK yerden aynı sonucu görür.
 */
export const MANAGER_PRESET_KEY = "access.managerPreset";

/** Owner kararıyla birleşik preset kullanan kurumlar (açık ayar yoksa). */
export const OWNER_UNIFIED_MANAGER_TENANTS: ReadonlySet<string> = new Set([DEFAULT_TENANT_ID]);

// ponytail: 5 sn süreç içi önbellek (session-validity ile aynı TTL); ayar yazımı invalidate eder.
const TTL_MS = 5_000;
const cache = new Map<string, { at: number; preset: ManagerPreset }>();

export function invalidateManagerPreset(tenantId?: string) {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

function isPreset(v: unknown): v is ManagerPreset {
  return typeof v === "string" && (MANAGER_PRESETS as readonly string[]).includes(v);
}

export async function resolveManagerPreset(tenantId: string): Promise<ManagerPreset> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at <= TTL_MS) return hit.preset;
  let preset: ManagerPreset = "branch_scoped";
  try {
    const s = await resolveSetting({ tenantId }, MANAGER_PRESET_KEY);
    if (s && s.sourceScope !== "platform" && isPreset(s.effectiveValue)) preset = s.effectiveValue;
    else if (OWNER_UNIFIED_MANAGER_TENANTS.has(tenantId)) preset = "unified";
    else if (s && isPreset(s.effectiveValue)) preset = s.effectiveValue;
  } catch {
    preset = "branch_scoped";
  }
  cache.set(tenantId, { at: Date.now(), preset });
  return preset;
}

/** Yetki kararında kullanılacak rol. Yalnız BRANCH_MANAGER etkilenir. */
export async function resolveEffectiveRole(role: AppRole, tenantId: string): Promise<AppRole> {
  if (role !== "BRANCH_MANAGER") return role;
  return (await resolveManagerPreset(tenantId)) === "unified" ? "SCHOOL_ADMIN" : role;
}
