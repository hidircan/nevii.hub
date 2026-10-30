"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "nevii-app-banner";
/** Kapatılan bant bu süre sonra yeniden önerilir (kalıcı susturma değil). */
const DISMISS_MS = 14 * 24 * 3600 * 1000;

type Props = {
  /** Özel URL şeması (ör. "neviihub"); iOS'ta yalnız açıkça tanımlıysa denenir. */
  scheme?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
  title: string;
  /** Kısa açıklama (ör. "Bildirimler ve tek dokunuşla işlemler"). */
  subtitle?: string;
  openLabel: string;
  dismissLabel: string;
  /** Platform markasından gelen ikon. */
  iconUrl: string;
};

/** Play bağlantısındaki `id=` paket adı (Android intent bağlantısı için). */
function androidPackage(playStoreUrl?: string): string | null {
  if (!playStoreUrl) return null;
  try {
    return new URL(playStoreUrl).searchParams.get("id");
  } catch {
    return null;
  }
}

/**
 * Mobil web "Uygulamada aç" bandı. Sayfa yüklenirken OTOMATİK yönlendirme
 * YAPMAZ (tarayıcılar izinsiz yönlendirmeyi engeller, döngü riski doğar);
 * kullanıcı dokununca açar.
 * - Android: `intent://` bağlantısı — uygulama yüklüyse açılır, değilse
 *   tarayıcı hata göstermeden Play Store'a düşer.
 * - iOS: şema yalnız MOBILE_APP_SCHEME tanımlıysa denenir (yüklü değilse
 *   Safari hata kutusu gösterir); yoksa doğrudan App Store açılır.
 * Kapatma 14 gün hatırlanır. Masaüstünde ve uygulamanın kendi web
 * görünümünde hiç görünmez.
 */
export function SiteAppBanner({ scheme, appStoreUrl, playStoreUrl, title, subtitle, openLabel, dismissLabel, iconUrl }: Props) {
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);

  useEffect(() => {
    let dismissedAt = 0;
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      dismissedAt = raw === "1" ? Date.now() : Number(raw) || 0;
    } catch {
      /* yoksay */
    }
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_MS) return;
    const ua = navigator.userAgent;
    if (/NeviiHubApp/i.test(ua)) return;
    const p = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : null;
    if (!p) return;
    if (p === "ios" && !appStoreUrl && !scheme) return;
    if (p === "android" && !playStoreUrl) return;
    const t = setTimeout(() => setPlatform(p), 0);
    return () => clearTimeout(t);
  }, [appStoreUrl, playStoreUrl, scheme]);

  if (!platform) return null;

  function open() {
    if (platform === "android") {
      const pkg = androidPackage(playStoreUrl);
      if (pkg) {
        const fallback = encodeURIComponent(playStoreUrl ?? "");
        window.location.href = `intent://#Intent;scheme=${scheme || "neviihub"};package=${pkg};S.browser_fallback_url=${fallback};end`;
      } else if (playStoreUrl) {
        window.location.href = playStoreUrl;
      }
      return;
    }
    if (!scheme) {
      if (appStoreUrl) window.location.href = appStoreUrl;
      return;
    }
    const timer = setTimeout(() => {
      if (appStoreUrl) window.location.href = appStoreUrl;
    }, 1200);
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) clearTimeout(timer);
      },
      { once: true }
    );
    window.location.href = `${scheme}://`;
  }

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* yoksay */
    }
    setPlatform(null);
  }

  return (
    <div
      role="region"
      aria-label={title}
      className="nh-rise fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_rgb(36_28_20/0.25)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-xl items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl ring-1 ring-slate-200" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          {subtitle ? <p className="truncate text-xs text-slate-600">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={open}
          className="shrink-0 rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
        >
          {openLabel}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={dismissLabel}
          className="shrink-0 rounded-lg px-2 py-2 text-sm text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
