"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 11. tur iş #10 — evrak arşivleme düğmesi (paylaşımlı).
 *
 * "Arşivle" belgeyi SİLMEZ — yalnız `cancelled` durumuna geçirir (referans,
 * içerik ve imzalı nüshalar korunur). Tek tıkla sessiz arşiv YOK: önce
 * "Emin misiniz?" onayı, başarısızlıkta satır içi hata gösterilir.
 * Başarıda liste/detay `router.refresh()` ile tazelenir.
 */
export function DocumentArchiveButton({
  documentId,
  variant = "link",
}: {
  documentId: string;
  /** "link" (tablo satırı) ya da "button" (detay başlık eylemi). */
  variant?: "link" | "button";
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/documents/${documentId}/archive`, { method: "POST" });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) {
        setError(json.error?.message || "Arşivlenemedi.");
        return;
      }
      setConfirm(false);
      router.refresh();
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setPending(false);
    }
  }

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirm(true);
        }}
        className={
          variant === "button"
            ? "inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-surface-muted)]"
            : "text-xs font-medium text-[var(--color-danger)] hover:opacity-80"
        }
      >
        Arşivle
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={variant === "button" ? "text-sm text-[var(--color-text-muted)]" : "text-xs text-[var(--color-text-muted)]"}>
        Arşivlensin mi? (Silinmez, İptal olarak işaretlenir.)
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => void run()}
        className="font-medium text-[var(--color-danger)] hover:underline disabled:opacity-50"
      >
        {pending ? "…" : "Evet, arşivle"}
      </button>
      <button
        type="button"
        onClick={() => {
          setConfirm(false);
          setError(null);
        }}
        className={
          variant === "button"
            ? "text-sm font-medium text-[var(--color-text-muted)] hover:underline"
            : "text-xs font-medium text-[var(--color-text-muted)] hover:underline"
        }
      >
        Vazgeç
      </button>
      {error ? (
        <span role="alert" className="font-medium text-[var(--color-danger)]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
