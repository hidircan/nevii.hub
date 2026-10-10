import { after } from "next/server";
import { REFRESH_TOKEN_TTL } from "./config";
import { uid } from "../utils";
import type { UserSessionRecord } from "../platform/types";

/**
 * NeviiOS oturum kaydı + presence.
 *
 * - Girişte bir `UserSession` satırı açılır; kimliği (sid) JWT'ye gömülür ve
 *   refresh boyunca korunur. Tekil sonlandırma satırı `revokedAt` ile işaretler;
 *   `isSessionClaimValid` sid'i kontrol eder (kayıt yoksa/okunamazsa fail-closed).
 * - Presence (son görülme / son ekran / son işlem) SÜREÇ İÇİ önbellektedir ve
 *   en fazla FLUSH_MS'de bir satıra yazılır. Audit tablosuna asla yazılmaz.
 *
 * ponytail: presence önbelleği instance başınadır; çok instance'ta "son
 * görülme" en fazla FLUSH_MS kadar geride kalabilir. Gerçek zamanlı gerekirse
 * Redis/Upstash TTL anahtarına taşınır (aynı arayüz).
 */
const FLUSH_MS = 5 * 60_000;

type Presence = { lastSeenAt: number; lastPath: string | null; lastAction: string | null; flushedAt: number };
const presence = new Map<string, Presence>();

export function ttlToMs(ttl: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
  if (!m) return 7 * 86_400_000;
  const n = Number(m[1]);
  return n * { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as "s" | "m" | "h" | "d"];
}

/** Ham user-agent saklanmaz; yalnız "Tarayıcı · İşletim sistemi" özeti. */
export function summarizeUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : /okhttp|Dalvik/i.test(ua)
              ? "Android uygulaması"
              : /CFNetwork|Darwin/.test(ua)
                ? "iOS uygulaması"
                : "Diğer";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "?";
  return `${browser} · ${os}`;
}

async function store() {
  return import("../platform/store-ext");
}

/**
 * Oturum açar ve sid döner. Kayıt yazılamazsa (ör. migration uygulanmamış)
 * giriş sid'siz devam eder: o oturum tekil sonlandırılamaz ama kullanıcı
 * düzeyi iptal (sessionsRevokedAt) ve pasifleştirme yine geçerlidir.
 */
export async function startUserSession(
  user: { userId: string; tenantId: string; role: string },
  request?: Request
): Promise<string | undefined> {
  const now = new Date();
  const row: UserSessionRecord = {
    id: uid("sess"),
    userId: user.userId,
    tenantId: user.tenantId,
    role: user.role,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlToMs(REFRESH_TOKEN_TTL)).toISOString(),
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    device: summarizeUserAgent(request?.headers.get("user-agent")),
    lastPath: null,
    lastAction: "login",
  };
  try {
    await (await store()).saveUserSession(row);
    return row.id;
  } catch {
    console.error("[neviios] session registry write failed; session continues without sid");
    return undefined;
  }
}

/**
 * Refresh: oturumun ömrünü uzatır. Kayıt yoksa/iptalse false (refresh reddedilir).
 *
 * Egress/kilit (2026-10-10): sayfa render'ında (RSC) yenilenen token çereze yazılamaz, bu yüzden
 * access süresi dolduktan sonraki HER gezinme yeniden refresh eder; eşzamanlı istekler de aynı
 * anda refresh eder. Uzatma, yeni bitiş mevcut bitişten FLUSH_MS'den fazla ileri değilse yazılmaz (DB'de koşullu, atomik);
 * yazılmadıysa iptal kontrolü salt okumayla yapılır — iptal edilmiş oturum hiçbir yolla yeniden
 * açılmaz (UPDATE koşulu `revokedAt IS NULL`). expiresAt (7 gün) en fazla FLUSH_MS geride kalabilir.
 */
export async function extendUserSession(sid: string): Promise<boolean> {
  const now = new Date();
  const p = presence.get(sid);
  const s = await store();
  const expiresAt = new Date(now.getTime() + ttlToMs(REFRESH_TOKEN_TTL));
  const written = await s.patchOpenUserSession(
    sid,
    {
      lastSeenAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      ...(p ? { lastPath: p.lastPath, lastAction: p.lastAction } : { lastAction: "refresh" }),
    },
    { expiresBefore: new Date(expiresAt.getTime() - FLUSH_MS) }
  );
  // Aynı istekteki presence dokunuşu (claimsToContext) ikinci bir yazım yapmasın.
  presence.set(sid, {
    lastSeenAt: now.getTime(),
    lastPath: p?.lastPath ?? null,
    lastAction: p?.lastAction ?? "refresh",
    flushedAt: now.getTime(),
  });
  if (written) return true;
  const row = await s.getUserSession(sid);
  return Boolean(row && !row.revokedAt);
}

/**
 * Yanıt bittikten sonra ama fonksiyon ömrü İÇİNDE çalıştırır (`after` → Vercel waitUntil): yarım
 * kalan yazım sonraki çağrıya kadar donup bağlantı/kilit tutmaz. İstek bağlamı yoksa (test/betik) hemen.
 */
function runAfterResponse(task: () => Promise<void>) {
  try {
    after(task);
  } catch {
    void task();
  }
}

/** Senkron, ucuz: yalnız bellek; gerekirse yanıttan sonra satıra yazar. */
export function touchSessionPresence(sid: string | undefined, info: { path?: string | null; action?: string | null }) {
  if (!sid) return;
  const now = Date.now();
  const prev = presence.get(sid);
  const next: Presence = {
    lastSeenAt: now,
    lastPath: info.path ?? prev?.lastPath ?? null,
    lastAction: info.action ?? prev?.lastAction ?? null,
    flushedAt: prev?.flushedAt ?? 0,
  };
  presence.set(sid, next);
  if (now - next.flushedAt < FLUSH_MS) return;
  next.flushedAt = now;
  // Koşullu kısmi yazım: iptal edilmiş satır asla yeniden açılmaz; başka instance/sekme son
  // FLUSH_MS içinde yazdıysa DB koşulu yazımı atlar (süreç belleğindeki sınır tek başına yetmez).
  runAfterResponse(async () => {
    try {
      await (await store()).patchOpenUserSession(
        sid,
        { lastSeenAt: new Date(now).toISOString(), lastPath: next.lastPath, lastAction: next.lastAction },
        { lastSeenBefore: new Date(now - FLUSH_MS) }
      );
    } catch {
      // presence best-effort; oturum geçerliliğini etkilemez
    }
  });
}

export function getSessionPresence(sid: string): { lastSeenAt: string; lastPath: string | null; lastAction: string | null } | null {
  const p = presence.get(sid);
  return p ? { lastSeenAt: new Date(p.lastSeenAt).toISOString(), lastPath: p.lastPath, lastAction: p.lastAction } : null;
}

export async function revokeUserSession(sid: string, by: string, reason: string): Promise<UserSessionRecord | null> {
  const row = await (await store()).revokeUserSessionRow(sid, by, reason);
  if (!row) return null;
  presence.delete(sid);
  const { invalidateSessionValidity } = await import("./session-validity");
  invalidateSessionValidity(row.userId);
  return row;
}

/** Kullanıcının açık tüm oturum satırlarını kapatır (sayım için). Token iptali sessionsRevokedAt ile yapılır. */
export async function closeAllUserSessions(userId: string, by: string, reason: string): Promise<number> {
  const s = await store();
  const open = await s.listUserSessions({ userId, openOnly: true });
  for (const row of open) {
    await s.revokeUserSessionRow(row.id, by, reason);
    presence.delete(row.id);
  }
  return open.length;
}

export function __resetPresenceForTests() {
  presence.clear();
}
