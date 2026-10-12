/**
 * Merkezi geri-navigasyon kuralı — saf, RN-bağımsız (node testlerinde
 * çalışır). TÜM rol route'larında aynı davranış:
 * - Yığında önceki ekran varsa `back()` (iOS swipe-back ve Android sistem
 *   geri tuşuyla AYNI hedef — üçü de navigation stack'i kullanır).
 * - Yoksa (deep-link ile doğrudan açılış) güvenli `fallback` route'a
 *   `replace()` — kullanıcı ölü ekranda kalmaz, App kapatılmaz.
 */
export type BackRouter = {
  back: () => void;
  canGoBack: () => boolean;
  replace: (href: string) => void;
};

export function goBack(router: BackRouter, fallback = "/"): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}

export type PersonaBasePath = "/(parent)" | "/(student)" | "/(teacher)" | "/(admin)";

/** Persona kökü + liste segmenti → deep-link fallback. Kök çözülemezse "/" (çift eğik çizgi üretilmez). */
export function listFallback(base: PersonaBasePath | "/", suffix: string): string {
  return base === "/" ? "/" : `${base}/${suffix}`;
}
