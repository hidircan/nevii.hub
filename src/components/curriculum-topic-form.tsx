"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";

const STATUSES = [
  { value: "planned", label: "Planlandı" },
  { value: "in_progress", label: "Çalışılıyor" },
  { value: "mastered", label: "Pekişti" },
  { value: "deferred", label: "Ertelendi" },
] as const;

export function CurriculumTopicForm({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string>("planned");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Başlık zorunlu.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const body: Record<string, unknown> = {
        studentId,
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        notes: notes.trim() || undefined,
      };
      const res = await fetch("/api/v1/curriculum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) {
        setError(json.error?.message || "Konu eklenemedi.");
        setBusy(false);
        return;
      }
      setSuccess(true);
      setTitle("");
      setDescription("");
      setNotes("");
      setStatus("planned");
      router.refresh();
    } catch {
      setError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-2">
      <div>
        <Label>Konu başlığı</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Do majör gam"
        />
      </div>
      <div>
        <Label>Açıklama (isteğe bağlı)</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none ring-cyan-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>
      <div>
        <Label>Durum</Label>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Not (isteğe bağlı)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error ? (
        <p className="text-xs font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      {success ? <p className="text-xs font-medium text-emerald-600">Konu eklendi.</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Kaydediliyor…" : "Konu ekle"}
      </Button>
    </form>
  );
}
