/**
 * N — tek aktif oturum (kontrollü devralma), 2026-09-23.
 *
 * Kural: bir kullanıcının aynı anda yalnız BİR açık oturumu olur. Yeni girişte
 *  - son ACTIVE_WINDOW içinde görülmüş başka bir oturum varsa ve istemci devralmayı
 *    destekliyorsa giriş durur, kullanıcıya "başka cihazda aktif" uyarısı gösterilir;
 *    onay verirse eski oturum "takeover" gerekçesiyle kapatılır, yeni oturum açılır.
 *  - pencere dışında kalmış (tarayıcı kapatılıp unutulmuş) açık oturumlar sorulmadan
 *    "superseded" olarak kapatılır — kural yine tek oturum.
 * Eski cihaz, oturum durumu uç noktasını yoklayarak kapatıldığını öğrenir ve bilgilendirilir.
 *
 * Neden sert "ikinci giriş reddedilir" değil: kaybolan/unutulan cihazda açık kalan
 * oturum, kullanıcıyı kendi hesabından kilitler ve destek yükü yaratır. Devralma,
 * hem hesabın tek kişide kalmasını hem de kullanıcının kendi başına kurtarmasını sağlar;
 * her devralma iki tarafa görünür ve denetim kaydına düşer.
 */
import type { UserSessionRecord } from "../platform/types";

/** Bu süre içinde görülmüş oturum "şu anda aktif" sayılır (erişim token'ı 15 dk, presence 5 dk'da bir yazılır). */
export const ACTIVE_SESSION_WINDOW_MS = 30 * 60_000;

export const TAKEOVER_REASON = "takeover";
export const SUPERSEDED_REASON = "superseded";

export function isRecentlyActive(row: Pick<UserSessionRecord, "lastSeenAt">, now: Date = new Date()): boolean {
  return now.getTime() - new Date(row.lastSeenAt).getTime() <= ACTIVE_SESSION_WINDOW_MS;
}

export async function listOpenSessions(userId: string): Promise<UserSessionRecord[]> {
  const { listUserSessions } = await import("../platform/store-ext");
  return listUserSessions({ userId, openOnly: true });
}

/** Kullanıcının tüm açık oturumlarını kapatır; kapanan satırları döner. */
export async function closeOpenSessions(userId: string, rows: UserSessionRecord[], now: Date = new Date()): Promise<number> {
  const { revokeUserSession } = await import("./session-registry");
  let closed = 0;
  for (const row of rows) {
    const reason = isRecentlyActive(row, now) ? TAKEOVER_REASON : SUPERSEDED_REASON;
    if (await revokeUserSession(row.id, userId, reason)) closed += 1;
  }
  return closed;
}

export type SessionStatus =
  | { state: "active" }
  | { state: "taken_over"; at: string | null }
  | { state: "ended"; reason: string | null };

/** Eski cihazın yokladığı durum: sid kapatıldıysa neden kapatıldığı. */
export async function resolveSessionStatus(sid: string | undefined, userId: string): Promise<SessionStatus> {
  if (!sid) return { state: "active" };
  const { getUserSession } = await import("../platform/store-ext");
  const row = await getUserSession(sid);
  if (!row || row.userId !== userId) return { state: "ended", reason: null };
  if (!row.revokedAt) return { state: "active" };
  if (row.revokeReason === TAKEOVER_REASON) return { state: "taken_over", at: row.revokedAt };
  return { state: "ended", reason: row.revokeReason ?? null };
}
