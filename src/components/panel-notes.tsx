"use client";

import { useState } from "react";
import Link from "@/components/link";
import { apiFetch } from "@/lib/api/client-fetch";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";
import type { PanelNote } from "@/lib/panel-notes";

const MAX = 2000;

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 2026-10-05 — Günlük Özet "Notlar" (ve /panel/notlar). Not yalnız eklenir; yazan ve zaman sunucuda kaydedilir.
 * `limit` verilirse yalnız en yeni N not gösterilir ve "Tüm notlar" bağlantısı çıkar.
 */
export function PanelNotes({ initialNotes, limit }: { initialNotes: PanelNote[]; limit?: number }) {
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const body = draft.trim();
    if (!body) {
      setError("Not boş olamaz. Kaydetmeden önce notunuzu yazın.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/v1/panel-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = (await res.json()) as { ok: boolean; data?: PanelNote; error?: { code?: string; message?: string } };
      if (!json.ok || !json.data) {
        setError(friendlyApiErrorMessage(json.error, "Not kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin."));
        return;
      }
      setNotes((prev) => [json.data!, ...prev]);
      setDraft("");
    } catch {
      setError("Not kaydedilemedi: sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  }

  const shown = limit ? notes.slice(0, limit) : notes;
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="panel-note-draft" className="sr-only">
          Yeni not
        </label>
        <textarea
          id="panel-note-draft"
          value={draft}
          maxLength={MAX}
          rows={limit ? 2 : 3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
          }}
          placeholder="Sonraki gelen için not bırakın… (ör. Ali'nin velisi yarın 15:00'te arayacak)"
          className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)]"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
            {draft.length > 0 ? `${draft.length}/${MAX}` : "Ctrl/⌘ + Enter ile kaydet"}
          </span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !draft.trim()}
            aria-busy={saving || undefined}
            className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-inverted)] hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Kaydediliyor…" : "Notu kaydet"}
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-1.5 rounded-md bg-[var(--color-danger-soft)] px-2 py-1 text-xs text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">Henüz not yok.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {shown.map((n) => (
            <li key={n.id} className="py-2">
              <p className="whitespace-pre-wrap break-words text-sm text-[var(--color-text)]">{n.body}</p>
              <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                {n.createdByName} · <time dateTime={n.createdAt}>{stamp(n.createdAt)}</time>
              </p>
            </li>
          ))}
        </ul>
      )}
      {limit && notes.length > 0 ? (
        <Link href="/panel/notlar" className="inline-block text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
          Tüm notlar →
        </Link>
      ) : null}
    </div>
  );
}
