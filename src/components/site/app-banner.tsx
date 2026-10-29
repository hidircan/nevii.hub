"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "nevii-app-banner";

type Props = {
  scheme?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
  title: string;
  openLabel: string;
  dismissLabel: string;
};

/**
 * Mobil web "Uygulamada aç" bandı. Sayfa yüklenirken OTOMATİK yönlendirme
 * YAPMAZ (tarayıcılar izinsiz yönlendirmeyi engeller, döngü riski doğar);
 * kullanıcı dokununca uygulamayı açmayı dener, açılmazsa mağazaya gider.
 * Kapatma tercihi cihazda saklanır. Masaüstünde hiç görünmez.
 */
export function SiteAppBanner({ scheme, appStoreUrl, playStoreUrl, title, openLabel, dismissLabel }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* yoksay */
    }
    if (dismissed) return;
    if (!/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return;
    if (/NeviiHubApp/i.test(navigator.userAgent)) return;
    const t = setTimeout(() => setShow(true), 0);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;
  const isIOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const storeUrl = isIOS ? appStoreUrl : playStoreUrl;

  function open() {
    if (!scheme) {
      if (storeUrl) window.open(storeUrl, "_blank", "noopener");
      return;
    }
    const timer = setTimeout(() => {
      if (storeUrl) window.open(storeUrl, "_blank", "noopener");
    }, 1200);
    const onHidden = () => {
      if (document.hidden) clearTimeout(timer);
    };
    document.addEventListener("visibilitychange", onHidden, { once: true });
    window.location.href = `${scheme}://`;
  }

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* yoksay */
    }
    setShow(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <p className="flex-1 text-sm font-medium text-slate-900">{title}</p>
        <button
          type="button"
          onClick={open}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
        >
          {openLabel}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={dismissLabel}
          className="rounded-lg px-2 py-2 text-sm text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
