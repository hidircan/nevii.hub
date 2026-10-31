"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadCheckoutSession, saveCheckoutSession, useCheckoutSession } from "@/components/billing/checkout-session";

/**
 * Checkout 30-dakika hareketsizlik bekçisi (§11).
 *
 * - Anlamlı kullanıcı işlemi (tıklama/tuş/form) sayacı sıfırlar; polling,
 *   animasyon ve arka plan fetch'i ETKİNLİK SAYILMAZ.
 * - 28. dakikada erişilebilir uyarı + geri sayım; "Devam et" sunucu
 *   kontrolüyle (token geçerliliği) süreyi uzatır.
 * - Süre sonunda hassas görünüm perdelenir; KAYIT SİLİNMEZ, e-posta
 *   kilitlenmez; güvenli doğrulamayla aynı taslağa dönülür.
 * - Sekme uyuması/çoklu sekme: mutlak bitiş zamanı + storage olaylarıyla
 *   sekmeler arası eşzamanlı; odakta yeniden hesaplanır.
 * - Ödeme işlenirken (busy sinyali) perde AÇILMAZ, sayaç duraklatılır;
 *   sağlayıcı penceresi/token süresi uygulama oturumundan ayrıdır.
 */

export const CHECKOUT_IDLE_LIMIT_MS = 30 * 60 * 1000;
export const CHECKOUT_WARN_AT_MS = 28 * 60 * 1000;

const BUSY_EVENT = "notaplan:payment-busy";

/** Ödeme formu bu olayı gönderir (sayaç duraklatma için). */
export function setCheckoutPaymentBusy(busy: boolean): void {
  try {
    window.dispatchEvent(new CustomEvent(BUSY_EVENT, { detail: { busy } }));
  } catch {
    /* yoksay */
  }
}

const fmtLeft = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function CheckoutTimeoutGuard({
  token,
  validatePath,
}: {
  /** Kayıt token'ı (yoksa taslak kipinde yerel uzatma). */
  token: string | null;
  /** Sunucu doğrulama adresi (örn. `/api/v1/billing/orders?t=...`). */
  validatePath: string | null;
}) {
  const session = useCheckoutSession();
  const [now, setNow] = useState(() => Date.now());
  const [busyPay, setBusyPay] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastTouch = useRef(0);

  const deadline = (session?.lastActivityAt ?? now) + CHECKOUT_IDLE_LIMIT_MS;
  const left = deadline - now;
  const expired = left <= 0;
  const warn = !expired && left <= CHECKOUT_IDLE_LIMIT_MS - CHECKOUT_WARN_AT_MS;

  const touch = useCallback(() => {
    const t = Date.now();
    if (t - lastTouch.current < 10_000) return;
    lastTouch.current = t;
    const s = loadCheckoutSession();
    if (s) saveCheckoutSession({ key: s.key, lastActivityAt: t });
  }, []);

  useEffect(() => {
    // Sayfa düzeyi: form tıklaması/tuşu/gönderimi etkinliktir. Arka plan
    // fetch/polling/animasyon dinlenmez → sayaç ilerler.
    const onActivity = () => touch();
    document.addEventListener("pointerdown", onActivity, { capture: true, passive: true });
    document.addEventListener("keydown", onActivity, { capture: true });
    document.addEventListener("submit", onActivity, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onActivity, { capture: true } as AddEventListenerOptions);
      document.removeEventListener("keydown", onActivity, { capture: true } as AddEventListenerOptions);
      document.removeEventListener("submit", onActivity, { capture: true } as AddEventListenerOptions);
    };
  }, [touch]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    const onVis = () => setNow(Date.now());
    const onBusy = (e: Event) => setBusyPay(Boolean((e as CustomEvent).detail?.busy));
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener(BUSY_EVENT, onBusy as EventListener);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener(BUSY_EVENT, onBusy as EventListener);
    };
  }, []);

  async function extend() {
    setChecking(true);
    setCheckError(null);
    try {
      if (token && validatePath) {
        // Güvenli sunucu kontrolü: token hâlâ geçerli mi?
        const res = await fetch(validatePath, { cache: "no-store" });
        if (!res.ok) {
          setChecking(false);
          setCheckError("Kayıt bulunamadı veya süresi dolmuş. Paket seçiminden yeniden başlayın.");
          return;
        }
      }
      const s = loadCheckoutSession();
      if (s) saveCheckoutSession({ key: s.key, lastActivityAt: Date.now() });
      lastTouch.current = Date.now();
      setNow(Date.now());
      setChecking(false);
    } catch {
      setChecking(false);
      setCheckError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    }
  }

  const showWarn = warn && !busyPay;
  const showExpired = expired && !busyPay;

  return (
    <div ref={wrapRef} className="contents" aria-hidden={!(showWarn || showExpired)}>
      {showWarn && !showExpired ? (
        <div role="alertdialog" aria-labelledby="idle-warn-t" aria-describedby="idle-warn-d" className="fixed inset-x-0 top-0 z-50 flex justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#5c3d00]/40 bg-[#f6f0e4] p-5 shadow-xl">
            <p id="idle-warn-t" className="font-semibold text-[#5c3d00]">İşleminize devam etmek istiyor musunuz?</p>
            <p id="idle-warn-d" className="mt-1 text-sm text-[#5c3d00]">
              Güvenlik için işlem <strong>{fmtLeft(left)}</strong> içinde zaman aşımına uğrayacak.
              Kaydınız silinmez; devam ederseniz kaldığınız yerden sürer.
            </p>
            <button
              type="button"
              onClick={() => void extend()}
              disabled={checking}
              autoFocus
              className="mt-3 w-full rounded-xl bg-[#5c3d00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4a3208] disabled:opacity-60"
            >
              {checking ? "Kontrol ediliyor…" : "Devam et"}
            </button>
            {checkError ? <p role="alert" className="mt-2 text-xs text-red-700">{checkError}</p> : null}
          </div>
        </div>
      ) : null}
      {showExpired ? (
        <div role="alertdialog" aria-labelledby="idle-exp-t" aria-describedby="idle-exp-d" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <p id="idle-exp-t" className="text-lg font-semibold text-slate-900">İşlem süresi doldu</p>
            <p id="idle-exp-d" className="mt-2 text-sm leading-relaxed text-slate-600">
              30 dakikadır işlem yapılmadı; güvenlik için ekran perdelendi. Kaydedilmiş
              başvurunuz silinmedi ve e-postanız kilitlenmedi.
            </p>
            <button
              type="button"
              onClick={() => void extend()}
              disabled={checking}
              autoFocus
              className="mt-4 w-full rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {checking ? "Kontrol ediliyor…" : "Güvenli şekilde devam et"}
            </button>
            {checkError ? <p role="alert" className="mt-2 text-xs text-red-700">{checkError}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
