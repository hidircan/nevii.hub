"use client";

import { useState } from "react";
import Link from "@/components/link";
import { apiFetch } from "@/lib/api/client-fetch";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";
import type { PanelNote } from "@/lib/panel-notes";
import { CriticalDeleteDialog } from "@/components/critical-delete-dialog";

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
 * 2026-10-05 — Günlük Özet "Notlar" (ve /panel/notlar). Yazan ve zaman sunucuda kaydedilir.
 * 2026-10-06 — düzenle (son düzenleyen görünür) / sil (kritik işlem şifresi + gerekçe; not gizlenir).
 * `limit` verilirse yalnız en yeni N not gösterilir ve "Tüm notlar" bağlantısı çıkar.
 */
export function PanelNotes({ initialNotes, limit }: { initialNotes: PanelNote[]; limit?: number }) {
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function saveEdit(id: string) {
    setEditBusy(true);
    setEditError(null);
    try {
      const res = await apiFetch("/api/v1/panel-notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, body: editDraft }),
      });
      const json = (await res.json()) as { ok: boolean; data?: PanelNote; error?: { code?: string; message?: string } };
      if (!json.ok || !json.data) {
        setEditError(friendlyApiErrorMessage(json.error, "Not güncellenemedi. Sayfayı yenileyip tekrar deneyin."));
        return;
      }
      setNotes((prev) => prev.map((n) => (n.id === id ? json.data! : n)));
      setEditingId(null);
    } catch {
      setEditError("Not güncellenemedi: sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setEditBusy(false);
    }
  }

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
            <li key={n.id} className="group py-2">
              {editingId === n.id ? (
                <div className="space-y-1.5">
                  <label htmlFor={`note-edit-${n.id}`} className="sr-only">Notu düzenle</label>
                  <textarea
                    id={`note-edit-${n.id}`}
                    value={editDraft}
                    maxLength={MAX}
                    rows={3}
                    autoFocus
                    onChange={(e) => setEditDraft(e.target.value)}
                    className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void saveEdit(n.id)}
                      disabled={editBusy || !editDraft.trim()}
                      className="rounded-md bg-[var(--color-primary)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-inverted)] disabled:opacity-60"
                    >
                      {editBusy ? "Kaydediliyor…" : "Kaydet"}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                      Vazgeç
                    </button>
                  </div>
                  {editError ? <p role="alert" className="text-xs text-[var(--color-danger)]">{editError}</p> : null}
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap break-words text-sm text-[var(--color-text)]">{n.body}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--color-text-muted)]">
                    <span>
                      {n.createdByName} · <time dateTime={n.createdAt}>{stamp(n.createdAt)}</time>
                      {n.updatedAt ? (
                        <>
                          {" "}· düzenlendi: {n.updatedByName ?? "Kayıtlı kullanıcı"}, <time dateTime={n.updatedAt}>{stamp(n.updatedAt)}</time>
                        </>
                      ) : null}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(n.id);
                          setEditDraft(n.body);
                          setEditError(null);
                        }}
                        className="font-medium text-[var(--color-primary)] hover:underline"
                      >
                        Düzenle
                      </button>
                      <CriticalDeleteDialog
                        triggerLabel="Sil"
                        title="Notu sil"
                        meaning="Not listeden kaldırılır. Kayıt silinmez; silen kişi, zaman ve gerekçe denetim için saklanır."
                        confirmationName="SİL"
                        confirmationLabel="Onay için kutuya yazın"
                        submitLabel="Notu sil"
                        loadImpact={async () => ({
                          ok: true,
                          data: { lines: [["Not", n.body.slice(0, 80)], ["Yazan", n.createdByName]], allowed: true, criticalPasswordConfigured: true },
                        })}
                        onSubmit={async ({ criticalPassword, reason, confirmation }) => {
                          if (!["sil", "sıl"].includes(confirmation.trim().toLocaleLowerCase("tr"))) {
                            return { ok: false, message: 'Onay için kutuya "SİL" yazın.' };
                          }
                          try {
                            const res = await apiFetch("/api/v1/panel-notes", {
                              method: "DELETE",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: n.id, criticalPassword, reason }),
                            });
                            const json = (await res.json()) as { ok: boolean; error?: { code?: string; message?: string } };
                            if (!json.ok) return { ok: false, message: friendlyApiErrorMessage(json.error, "Not silinemedi; hiçbir şey değişmedi.") };
                            setNotes((prev) => prev.filter((x) => x.id !== n.id));
                            return { ok: true };
                          } catch {
                            return { ok: false, message: "Sunucuya ulaşılamadı; bağlantınızı kontrol edip tekrar deneyin." };
                          }
                        }}
                      />
                    </span>
                  </div>
                </>
              )}
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
