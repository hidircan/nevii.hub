/**
 * 2026-10-16 (owner) — web oturumu hareketsizlik politikası. TEK kaynak: istemci (zamanlayıcı, uyarı, yoklama
 * duraklatma) ve sunucu (JWT `act` talebiyle çerezli istek/yenileme reddi) aynı süreleri kullanır.
 * `act` = son GERÇEK kullanıcı etkileşimi (epoch sn). API yanıtı, yoklama ve token yenileme `act`'i ilerletmez; yalnız
 * istemcinin etkileşim sonrası seyrek "etkinlik" isteği (`/api/v1/auth/refresh` `{ activity: true }`) ilerletir.
 * `act` yalnız tarayıcı girişinde (Origin başlığı) token'a gömülür ve varsa HER yolda uygulanır; mobil giriş token'ında
 * `act` yoktur — mobil arka plan ve push davranışı değişmez.
 * Süre `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES` ile değiştirilebilir (varsayılan 30).
 */
const minutes = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const IDLE_LOGOUT_MS = minutes(process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES, 30) * 60_000;
/** Çıkıştan önceki uyarı süresi. */
export const IDLE_WARNING_MS = 2 * 60_000;
/** Bu kadar etkileşim yoksa zorunlu olmayan yoklama/yenileme durur. */
export const POLL_PAUSE_IDLE_MS = 5 * 60_000;
/** Etkinlik bildirimi en fazla bu aralıkla (sekmeler arası ortak). */
export const ACTIVITY_PING_MS = 5 * 60_000;

/** `act` (epoch sn) varsa ve süre aşıldıysa true. `act` yoksa (eski token) false — saat bir sonraki yenilemede başlar. */
export function isIdleExpired(act: number | undefined, nowMs = Date.now()): boolean {
  return typeof act === "number" && nowMs - act * 1000 > IDLE_LOGOUT_MS;
}

export const nowSec = (nowMs = Date.now()) => Math.floor(nowMs / 1000);

export const IDLE_LOGOUT_MESSAGE = `Uzun süre işlem yapılmadığı için (${Math.round(IDLE_LOGOUT_MS / 60_000)} dk) güvenlik amacıyla oturumunuz kapatıldı. Yeniden giriş yapın.`;
