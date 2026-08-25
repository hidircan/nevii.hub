"use client";

/** Faz 3B — öğretmenin bekleyen dört haftalık değerlendirmeleri + gönderim formu. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export type PendingPeriodicItem = {
  studentId: string;
  studentName: string;
  teacherId: string;
  periodStart: string;
  periodEnd: string;
};

function PendingItemForm({ item, onSubmitted }: { item: PendingPeriodicItem; onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [overallProgressNote, setOverallProgressNote] = useState("");
  const [strengthsNote, setStrengthsNote] = useState("");
  const [areasForImprovementNote, setAreasForImprovementNote] = useState("");
  const [recommendationNote, setRecommendationNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!overallProgressNote.trim()) {
      setError("Genel gelişim değerlendirmesi zorunludur.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/periodic-assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: item.studentId,
        periodStart: item.periodStart,
        periodEnd: item.periodEnd,
        overallProgressNote,
        strengthsNote: strengthsNote.trim() || undefined,
        areasForImprovementNote: areasForImprovementNote.trim() || undefined,
        recommendationNote: recommendationNote.trim() || undefined,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.ok) {
      setError(json.error?.message || "Gönderilemedi.");
      return;
    }
    onSubmitted();
  }

  return (
    <Card className="!p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">{item.studentName}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {formatDate(item.periodStart)} – {formatDate(item.periodEnd)}
          </p>
        </div>
        {!open ? (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Değerlendirmeyi doldur
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
              Genel gelişim değerlendirmesi *
            </label>
            <textarea
              value={overallProgressNote}
              onChange={(e) => setOverallProgressNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none ring-amber-200 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Güçlü yönler</label>
            <textarea
              value={strengthsNote}
              onChange={(e) => setStrengthsNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none ring-amber-200 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Gelişime açık alanlar</label>
            <textarea
              value={areasForImprovementNote}
              onChange={(e) => setAreasForImprovementNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none ring-amber-200 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Öneriler</label>
            <textarea
              value={recommendationNote}
              onChange={(e) => setRecommendationNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none ring-amber-200 focus:ring-2"
            />
          </div>
          {error ? <p className="text-xs font-medium text-[#8b3a3a]">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? "Gönderiliyor…" : "Gönder"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Vazgeç
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export function PeriodicAssessmentPendingList({ items }: { items: PendingPeriodicItem[] }) {
  const router = useRouter();
  if (items.length === 0) {
    return <EmptyState title="Bekleyen değerlendirme yok" description="Tüm dört haftalık değerlendirmeler güncel." />;
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <PendingItemForm
          key={`${item.studentId}:${item.periodStart}`}
          item={item}
          onSubmitted={() => router.refresh()}
        />
      ))}
    </div>
  );
}
