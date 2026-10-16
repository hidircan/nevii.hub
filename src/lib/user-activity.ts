/**
 * 2026-10-16 — istemci: son GERÇEK kullanıcı etkileşimi (tıklama, tuş, kaydırma, dokunma, fare). Sekmeler arası
 * `localStorage` ile ortak; API yanıtı/yoklama/token yenileme buraya yazmaz. Sunucuya yazmaz — DB'ye etkinlik
 * yalnız `IdleSessionManager`'ın seyrek etkinlik isteğiyle gider.
 */
import { POLL_PAUSE_IDLE_MS } from "./session-policy";

const KEY = "nh:lastActivity";
let last = typeof window === "undefined" ? 0 : Date.now();
let lastStored = 0;

export function lastUserActivityAt(): number {
  let v = last;
  try {
    const s = Number(window.localStorage.getItem(KEY));
    if (s > v) v = s;
  } catch {
    // depolama kapalı: yalnız bu sekmenin bilgisi
  }
  return v;
}

/** Etkileşim kaydı. Hareketsizlikten (≥ POLL_PAUSE_IDLE_MS) dönüşte bir kez `nh:active-again` olayı. */
export function markUserActivity(now = Date.now()) {
  const wasIdle = now - lastUserActivityAt() >= POLL_PAUSE_IDLE_MS;
  last = now;
  // ponytail: depolamaya en fazla 5 sn'de bir (fare hareketi her olayda yazmasın).
  if (now - lastStored >= 5_000) {
    lastStored = now;
    try {
      window.localStorage.setItem(KEY, String(now));
    } catch {
      // yok say
    }
  }
  if (wasIdle) window.dispatchEvent(new Event("nh:active-again"));
}

/** Zorunlu olmayan yoklama/yenileme bu durumda atlanır. */
export function isUserIdle(ms = POLL_PAUSE_IDLE_MS): boolean {
  return Date.now() - lastUserActivityAt() >= ms;
}
