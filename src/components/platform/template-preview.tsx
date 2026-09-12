"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { DEFAULT_INVITE_TEMPLATE, TEMPLATE_VARIABLES } from "@/lib/platform/policies";

/** Şablon önizleme — sunucuda doğrulanır ve örnek değerle render edilir; gönderim YOK. */
export function TemplatePreview() {
  const [subject, setSubject] = useState(DEFAULT_INVITE_TEMPLATE.subject);
  const [body, setBody] = useState(DEFAULT_INVITE_TEMPLATE.body);
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function preview() {
    setError(null);
    const res = await fetch("/api/v1/platform/templates/preview", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body }),
    });
    const json = (await res.json()) as { ok: boolean; data?: { preview: { subject: string; body: string } }; error?: { message: string } };
    if (!json.ok) {
      setResult(null);
      setError(json.error?.message ?? "Önizleme başarısız");
      return;
    }
    setResult(json.data!.preview);
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold">Şablon önizleme (gönderim yapılmaz)</h2>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        İzinli değişkenler: {TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(", ")}
      </p>
      <div className="mt-3 space-y-2">
        <Input aria-label="Konu" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea
          aria-label="Gövde"
          rows={6}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button variant="secondary" onClick={() => void preview()}>
          Önizle
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="mt-3 rounded-[var(--radius-md)] border p-3 text-sm" style={{ borderColor: "var(--color-border)" }}>
          <p className="font-semibold">{result.subject}</p>
          <p className="mt-2 whitespace-pre-wrap text-[var(--color-text-muted)]">{result.body}</p>
        </div>
      ) : null}
    </Card>
  );
}
