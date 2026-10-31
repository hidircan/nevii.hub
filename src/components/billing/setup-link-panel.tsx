"use client";

import { useState, useSyncExternalStore } from "react";

function subscribeStorage(cb: () => void) {
  window.addEventListener("order-setup-link", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("order-setup-link", cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Parola kurulum bağlantısı paneli (sonuç ekranı).
 * - İlk bağlantı mock tamamlama yanıtından sessionStorage'a yazılır (URL'ye konmaz).
 * - "Yeniden gönder" kontrollü yeni jeton üretir (eski ölür).
 * - Local turda bağlantı ekranda gösterilir; gerçek e-posta gönderilmez.
 */
export function SetupLinkPanel({ token, maskedEmail }: { token: string; maskedEmail: string }) {
  const storageKey = `order_setup:${token.slice(0, 16)}`;
  // SSR/hydration uyumu: sunucu anlık görüntüsü null, istemci deposu senkron okunur.
  const stored = useSyncExternalStore(
    subscribeStorage,
    () => {
      try {
        return sessionStorage.getItem(storageKey);
      } catch {
        return null;
      }
    },
    () => null
  );
  const [fresh, setFresh] = useState<string | null>(null);
  const link = fresh ?? stored;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);

  async function resend() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/billing/orders/setup-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { setupPath?: string };
        error?: { message?: string };
      };
      setBusy(false);
      if (!json.ok || !json.data?.setupPath) {
        setError(json.error?.message ?? "Bağlantı üretilemedi.");
        return;
      }
      try {
        sessionStorage.setItem(storageKey, json.data.setupPath);
      } catch {
        // ignore
      }
      try {
        window.dispatchEvent(new Event("order-setup-link"));
      } catch {
        // ignore
      }
      setFresh(json.data.setupPath);
      setSentAt(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      setBusy(false);
      setError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Hesabınıza erişmek için parolanızı belirleyin</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        Kurulum bağlantısı {maskedEmail} adresine gönderilir. Bağlantı tek kullanımlıktır ve 72 saat
        geçerlidir; e-posta sahipliği doğrulanmadan yönetici erişimi açılmaz.
      </p>
      {link ? (
        <div className="mt-4 rounded-xl bg-slate-900 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-white/75">
            Demo bağlantısı — gerçek kurulumda e-postayla gider
          </p>
          <a href={link} className="mt-1 block break-all text-sm font-medium text-white underline">
            {link}
          </a>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-[#f6f0e4] p-3 text-sm text-[#5c3d00] ring-1 ring-[#e3d6bc]">
          Bağlantı bu ekranda görünmüyorsa yeniden gönderin; önceki bağlantı geçersiz olur.
        </p>
      )}
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
      {sentAt ? <p role="status" className="mt-3 text-sm text-emerald-700">Yeni bağlantı üretildi ({sentAt}).</p> : null}
      <button
        type="button"
        onClick={resend}
        disabled={busy}
        className="mt-4 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
      >
        {busy ? "Üretiliyor…" : "Kurulum bağlantısını yeniden gönder"}
      </button>
    </div>
  );
}
