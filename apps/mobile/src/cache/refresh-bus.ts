/**
 * Hedefli revalidation veriyolu (Faz 8) — RN-bağımsız, test edilir.
 *
 * Soket/realtime altyapısı YOK (bilinçli karar): foreground push alındığında
 * ilgili kapsam bump'lanır; görünür ekranlar tazelenir. Kapsam-dışı ekranlar
 * etkilenmez (global polling YOK). Background/killed için: push + açılışta
 * focus-refresh (事物 zaten mevcut kancalar).
 */
export type RefreshScope =
  | "schedule"
  | "attendance"
  | "homework"
  | "payments"
  | "makeup"
  | "notifications"
  | "reference"
  | "all";

type Listener = { scopes: ReadonlySet<RefreshScope>; cb: () => void };

const listeners = new Set<Listener>();

/** Kapsamı bump'la — o kapsam + "all" dinleyicileri tetiklenir. */
export function bumpScope(scope: RefreshScope): void {
  for (const l of listeners) {
    if (l.scopes.has(scope) || l.scopes.has("all") || scope === "all") {
      try {
        l.cb();
      } catch {
        // Dinleyici hatası veriyolunu kırmaz.
      }
    }
  }
}

/** Kapsam(lar)a abone ol — cleanup fonksiyonu döner. */
export function subscribeToScopes(scopes: RefreshScope[], cb: () => void): () => void {
  const listener: Listener = { scopes: new Set(scopes), cb };
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test izolasyonu (üretimde kullanılmaz). */
export function __resetRefreshBus(): void {
  listeners.clear();
}
