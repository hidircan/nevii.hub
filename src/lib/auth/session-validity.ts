import { isDbMode } from "../config";

/**
 * NeviiOS — token imzası geçerli olsa bile oturumun HÂLÂ geçerli olup
 * olmadığı: kullanıcı pasif/silinmiş mi, oturumlar iptal edilmiş mi
 * (şifre değişimi, pasifleştirme, "tüm oturumları kapat"), tekil oturum
 * (sid) sonlandırılmış mı, rol veya tenant token'dakinden farklı mı.
 * API (`authenticateRequest`) ve sayfa oturumu (`getSessionContext`) aynı
 * kontrolü kullanır. Kayıt okunamazsa fail-closed `false`.
 *
 * ponytail: 5 sn süreç içi önbellek (istek başına DB sorgusu olmasın);
 * çok instance'ta iptal en geç 5 sn + sonraki istek içinde yayılır. Aynı
 * süreçte yazım `invalidateSessionValidity` ile anında etkilidir.
 */
const TTL_MS = 5_000;
const cache = new Map<string, { at: number; state: SessionUserState | null }>();
const sidCache = new Map<string, { at: number; open: boolean; userId: string | null }>();

type SessionUserState = {
  active: boolean;
  role: string | null;
  tenantId: string | null;
  sessionsRevokedAt: string | null;
};

export function invalidateSessionValidity(userId?: string) {
  if (userId) {
    cache.delete(userId);
    for (const [sid, v] of sidCache) if (v.userId === userId || v.userId === null) sidCache.delete(sid);
  } else {
    cache.clear();
    sidCache.clear();
  }
}

async function loadState(userId: string): Promise<SessionUserState | null> {
  if (isDbMode) {
    const { getPrisma } = await import("../db");
    const row = await getPrisma().user.findUnique({
      where: { id: userId },
      select: { active: true, deletedAt: true, role: true, tenantId: true, sessionsRevokedAt: true },
    });
    if (!row) return null;
    return {
      active: row.active && !row.deletedAt,
      role: row.role,
      tenantId: row.tenantId,
      sessionsRevokedAt: row.sessionsRevokedAt?.toISOString() ?? null,
    };
  }
  // json/memory: demo hesapları koddadır; yalnız NeviiOS yaşam döngüsü bindirmesi okunur.
  const { getUserLifecycle } = await import("../platform/store-ext");
  const s = await getUserLifecycle(userId);
  // Emekliye ayrılmış / kapatılmış bootstrap hesabı (ör. eski admin@) → açık token'lar geçersiz.
  const { bootstrapLoginEnabled } = await import("./users");
  const active = (!s || s.status === "active") && bootstrapLoginEnabled(userId);
  return { active, role: null, tenantId: null, sessionsRevokedAt: s?.sessionsRevokedAt ?? null };
}

/** sid açık mı? Kayıt yoksa, başka kullanıcıya aitse veya iptalse false. */
async function isSidOpen(sid: string, userId: string): Promise<boolean> {
  let entry = sidCache.get(sid);
  if (!entry || Date.now() - entry.at > TTL_MS) {
    const { getUserSession } = await import("../platform/store-ext");
    const row = await getUserSession(sid);
    entry = { at: Date.now(), open: Boolean(row && !row.revokedAt), userId: row?.userId ?? null };
    sidCache.set(sid, entry);
  }
  return entry.open && entry.userId === userId;
}

export async function isSessionClaimValid(
  claims: { sub: string; role: string; tenantId: string; iat?: number; sid?: string },
  opts?: { ignoreRole?: boolean }
): Promise<boolean> {
  let entry = cache.get(claims.sub);
  if (!entry || Date.now() - entry.at > TTL_MS) {
    try {
      entry = { at: Date.now(), state: await loadState(claims.sub) };
    } catch {
      return false;
    }
    cache.set(claims.sub, entry);
  }
  const s = entry.state;
  if (!s || !s.active) return false;
  // Refresh yolu rolü güncel kayıttan yeniden basar; diğer yollarda eski rol reddedilir.
  if (!opts?.ignoreRole && s.role && s.role !== claims.role) return false;
  if (s.tenantId && s.tenantId !== claims.tenantId) return false;
  if (s.sessionsRevokedAt) {
    const revokedSec = Math.floor(new Date(s.sessionsRevokedAt).getTime() / 1000);
    if (!claims.iat || claims.iat < revokedSec) return false;
  }
  // Tekil oturum sonlandırma. sid'siz (tur 3 öncesi) token'lar yalnız kullanıcı düzeyi kontrole tabidir.
  if (claims.sid) {
    try {
      if (!(await isSidOpen(claims.sid, claims.sub))) return false;
    } catch {
      return false;
    }
  }
  return true;
}
