"use client";

/**
 * P0 (2026-09-05) — şifre oluşturma sonrası istemci tarafı yönlendirme.
 * Sunucu HANGİ portala gidileceğini söyler (rol güvenilir kaynaktan gelir,
 * bkz. post-password-routing.ts); burada yalnızca "uygulamayı açmayı dene,
 * açılmazsa web portalına düş" davranışı vardır.
 *
 * YÖNLENDİRME DÖNGÜSÜ OLAMAZ: derin bağlantı EN FAZLA BİR KEZ denenir ve
 * zamanlayıcı her hâlükârda web portalına düşer. Uygulama açılırsa sekme
 * arka plana geçer (`visibilitychange`) ve düşüş iptal edilir.
 */
import type { ClientSurface } from "./post-password-routing";

export type PostPasswordDestinationPayload = {
  webPath: string;
  deepLink?: string;
  appDownloadUrl?: string;
};

const DEEP_LINK_FALLBACK_MS = 1200;

/** Tarayıcıda çalışan ortam tespiti — sunucuya YALNIZ sunum ipucu olarak gönderilir. */
export function currentClientSurface(): ClientSurface {
  if (typeof navigator === "undefined") return "desktop_web";
  const ua = navigator.userAgent;
  // Uygulama webview'i kendini `NeviiHubApp` ile tanıtır (tanımlı değilse hiç eşleşmez).
  if (/NeviiHubApp/i.test(ua)) return "mobile_app";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ? "mobile_web" : "desktop_web";
}

export function goToPostPasswordDestination(
  destination: PostPasswordDestinationPayload,
  navigate: (path: string) => void
): void {
  if (!destination.deepLink) {
    navigate(destination.webPath);
    return;
  }
  const timer = setTimeout(() => navigate(destination.webPath), DEEP_LINK_FALLBACK_MS);
  const onHidden = () => {
    if (document.hidden) clearTimeout(timer);
  };
  document.addEventListener("visibilitychange", onHidden, { once: true });
  window.location.href = destination.deepLink;
}
