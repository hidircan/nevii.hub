"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null; // yeniden denemede baştan yüklensin
      script.remove();
      reject(new Error("turnstile script"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Yönetilen (Managed) Turnstile alanı. Token tek kullanımlıktır: üst bileşen her
 * denemeden sonra `key` değiştirerek alanı yeniden kurar ve yeni token alır.
 */
export function TurnstileField({
  siteKey,
  lang,
  onToken,
}: {
  siteKey: string;
  lang: "tr" | "en";
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Üst bileşenin her render'daki yeni fonksiyonu widget'ı yeniden kurmasın.
  const tokenSink = useRef(onToken);
  useEffect(() => {
    tokenSink.current = onToken;
  });

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | undefined;
    const fail = () => {
      tokenSink.current(null);
      setFailed(true);
    };
    tokenSink.current(null);
    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId = window.turnstile.render(container.current, {
          sitekey: siteKey,
          action: "login",
          language: lang,
          theme: "auto",
          // Esnek boyutun alt sınırı 300 px; en dar telefonlarda taşmasın.
          size: window.innerWidth < 340 ? "compact" : "flexible",
          retry: "auto",
          "refresh-expired": "auto",
          callback: (token: string) => {
            setFailed(false);
            tokenSink.current(token);
          },
          "expired-callback": () => tokenSink.current(null),
          "timeout-callback": () => tokenSink.current(null),
          "error-callback": () => {
            fail();
            return true; // hata bizde gösterilir
          },
        });
      })
      .catch(() => {
        if (!cancelled) fail();
      });
    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, lang, attempt]);

  return (
    <div>
      <div ref={container} aria-label={lang === "en" ? "Security check" : "Güvenlik doğrulaması"} />
      {failed ? (
        <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
          {lang === "en"
            ? "The security check could not load, so sign-in is paused. Check your connection or disable content blockers for this page, then "
            : "Güvenlik doğrulaması yüklenemedi, bu yüzden giriş bekliyor. Bağlantınızı kontrol edin veya bu sayfa için içerik engelleyiciyi kapatın, sonra "}
          <button type="button" className="font-semibold underline" onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}>
            {lang === "en" ? "try again" : "tekrar deneyin"}
          </button>
          .
        </p>
      ) : null}
    </div>
  );
}
