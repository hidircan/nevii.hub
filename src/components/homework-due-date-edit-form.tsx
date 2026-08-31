"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

/** FEATURE C — yalnızca ödevi veren öğretmen görür/kullanır (bkz. updateHomeworkDueDateTool). */
export function HomeworkDueDateEditForm({ homeworkId, currentDueDate }: { homeworkId: string; currentDueDate: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [dueDate, setDueDate] = useState(currentDueDate.slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPast = new Date(currentDueDate) < new Date();

  async function onSave() {
    if (!dueDate) {
      setError("Tarih zorunlu.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/homework/${homeworkId}/due-date`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: new Date(dueDate).toISOString() }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) {
        setError(json.error?.message || "Güncellenemedi.");
        setBusy(false);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1 text-xs font-medium text-cyan-700 hover:underline"
      >
        Son teslim tarihini değiştir{isPast ? " (süresi geçti)" : ""}
      </button>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none ring-cyan-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      <Button type="button" onClick={onSave} disabled={busy} className="!px-2.5 !py-1 !text-xs">
        {busy ? "Kaydediliyor…" : "Kaydet"}
      </Button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setError(null);
        }}
        disabled={busy}
        className="text-[10px] font-medium text-[var(--color-text-muted)] hover:underline"
      >
        Vazgeç
      </button>
      {error ? <span className="text-[10px] font-medium text-rose-600">{error}</span> : null}
    </div>
  );
}
