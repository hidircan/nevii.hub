"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Card } from "@/components/ui";

export function AiFeedbackSummaryButton({
  subject,
  subjectId,
}: {
  subject: "teacher" | "student";
  subjectId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [responseCount, setResponseCount] = useState<number | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/feedback-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, subjectId }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { summary: string; responseCount: number; eligible: boolean };
        error?: { message: string };
      };
      if (!json.ok || !json.data) {
        setError(json.error?.message || "Özet oluşturulamadı.");
        return;
      }
      setSummary(json.data.summary);
      setResponseCount(json.data.responseCount);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="secondary" onClick={run} disabled={busy}>
        <Sparkles className="h-4 w-4" />
        {busy ? "Özet oluşturuluyor…" : "AI ile genel değerlendirme özeti oluştur"}
      </Button>

      {error ? (
        <p className="mt-2 text-sm font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      {summary ? (
        <Card className="mt-3 !p-4">
          {responseCount !== null ? (
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              {responseCount} değerlendirme temel alındı
            </p>
          ) : null}
          <pre className="whitespace-pre-wrap font-sans text-sm text-[var(--color-text)]">{summary}</pre>
        </Card>
      ) : null}
    </div>
  );
}
