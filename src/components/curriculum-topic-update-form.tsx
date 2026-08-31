"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";
import type { CurriculumTopicStatus } from "@/lib/types";

const STATUSES: { value: CurriculumTopicStatus; label: string }[] = [
  { value: "planned", label: "Planlandı" },
  { value: "in_progress", label: "Çalışılıyor" },
  { value: "mastered", label: "Pekişti" },
  { value: "deferred", label: "Ertelendi" },
];

export function CurriculumTopicUpdateForm({
  topicId,
  currentStatus,
}: {
  topicId: string;
  currentStatus: CurriculumTopicStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [changeNote, setChangeNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/curriculum/${topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          changeNote: changeNote.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) {
        setError(json.error?.message || "Güncellenemedi.");
        setBusy(false);
        return;
      }
      setChangeNote("");
      router.refresh();
    } catch {
      setError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-2 space-y-1.5 border-t border-[var(--color-border)] pt-2">
      <div>
        <Label>Durum</Label>
        <Select value={status} onChange={(e) => setStatus(e.target.value as CurriculumTopicStatus)}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <Input
        value={changeNote}
        onChange={(e) => setChangeNote(e.target.value)}
        placeholder="Değişiklik notu (isteğe bağlı)"
        aria-label="Değişiklik notu"
      />
      {error ? (
        <p className="text-[11px] font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" disabled={busy} className="!py-1.5 text-xs">
        {busy ? "Kaydediliyor…" : "Güncelle"}
      </Button>
    </form>
  );
}
