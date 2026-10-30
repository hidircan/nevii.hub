import { createHash } from "node:crypto";
import { isDbMode } from "../config";

/**
 * Hesap bazlı giriş sınırı — IP'den bağımsız ve sunucu örnekleri arasında ortak.
 * IP sınırı (`rate-limit.ts`) örnek başınadır; dağıtık denemeyi durduramaz. Web ve
 * mobil uç aynı sayacı paylaşır. db modunda `SettingOverride` satırı (e-postanın
 * özeti, ham e-posta yazılmaz); yalnız var olan hesaba yazar, rastgele e-postayla
 * tablo şişirilemez. Sayaç okunamazsa giriş engellenmez: kimlik doğrulaması yine çalışır.
 *
 * Bilinçli bedel: saldırgan bir hesabı 15 dk kilitleyebilir. Eşik, gerçek kullanıcının
 * yanlışlıkla ulaşmayacağı kadar yüksek tutuldu; süre sonunda kendiliğinden açılır.
 */
export const LOGIN_THROTTLE_MAX_FAILURES = 10;
export const LOGIN_THROTTLE_WINDOW_MS = 15 * 60_000;

const SCOPE = "auth_throttle:login";
const KEY = "failures";

type Counter = { count: number; since: number };
const memory = new Map<string, Counter>();

const hashOf = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 40);

function blocked(c: Counter | null | undefined, now: number): boolean {
  return !!c && now - c.since < LOGIN_THROTTLE_WINDOW_MS && c.count >= LOGIN_THROTTLE_MAX_FAILURES;
}

/** Hesap kilitli mi? `hasCounter`, başarılı girişte gereksiz silme yazmamak içindir. */
export async function readLoginThrottle(email: string, now = Date.now()): Promise<{ blocked: boolean; hasCounter: boolean }> {
  const id = hashOf(email);
  if (!isDbMode) {
    const c = memory.get(id);
    return { blocked: blocked(c, now), hasCounter: !!c };
  }
  try {
    const { getPrisma } = await import("../db");
    const row = await getPrisma().settingOverride.findUnique({
      where: { scopeType_scopeId_key: { scopeType: SCOPE, scopeId: id, key: KEY } },
      select: { value: true },
    });
    return { blocked: blocked(row?.value as Counter | undefined, now), hasCounter: !!row };
  } catch (e) {
    console.error("[login-throttle] okunamadı", (e as Error).message);
    return { blocked: false, hasCounter: false };
  }
}

export async function recordLoginFailure(email: string, now = Date.now()): Promise<void> {
  const id = hashOf(email);
  if (!isDbMode) {
    const c = memory.get(id);
    memory.set(id, c && now - c.since < LOGIN_THROTTLE_WINDOW_MS ? { count: c.count + 1, since: c.since } : { count: 1, since: now });
    return;
  }
  try {
    const { getPrisma } = await import("../db");
    const cutoff = now - LOGIN_THROTTLE_WINDOW_MS;
    // Tek ifade: eşzamanlı başarısız denemeler sayacı kaçırmaz.
    await getPrisma().$executeRaw`
      INSERT INTO "SettingOverride" ("id", "scopeType", "scopeId", "key", "value", "updatedBy", "updatedAt")
      SELECT ${`thr_${id}`}, ${SCOPE}, ${id}, ${KEY}, jsonb_build_object('count', 1, 'since', ${now}::bigint), 'system', NOW()
      WHERE EXISTS (SELECT 1 FROM "User" WHERE "email" = ${email.trim().toLowerCase()} AND "deletedAt" IS NULL)
      ON CONFLICT ("scopeType", "scopeId", "key") DO UPDATE SET
        "value" = CASE
          WHEN ("SettingOverride"."value"->>'since')::bigint < ${cutoff}::bigint
            THEN jsonb_build_object('count', 1, 'since', ${now}::bigint)
          ELSE jsonb_set("SettingOverride"."value", '{count}', to_jsonb(("SettingOverride"."value"->>'count')::int + 1))
        END,
        "updatedAt" = NOW()`;
  } catch (e) {
    console.error("[login-throttle] yazılamadı", (e as Error).message);
  }
}

export async function clearLoginThrottle(email: string): Promise<void> {
  const id = hashOf(email);
  if (!isDbMode) {
    memory.delete(id);
    return;
  }
  try {
    const { getPrisma } = await import("../db");
    await getPrisma().settingOverride.deleteMany({ where: { scopeType: SCOPE, scopeId: id, key: KEY } });
  } catch (e) {
    console.error("[login-throttle] temizlenemedi", (e as Error).message);
  }
}

export function resetLoginThrottleForTests() {
  memory.clear();
}
