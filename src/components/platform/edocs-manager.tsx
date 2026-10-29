"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { callApi } from "@/components/platform/api";

export type EDocRow = {
  orderId: string;
  docId: string | null;
  tenantId: string;
  buyerTitle: string;
  planLabel: string;
  interval: string;
  totalDisplay: string;
  periodDisplay: string;
  kindLabel: string;
  status: string;
  statusLabel: string;
  emailLabel: string;
  providerRef: string | null;
  error: string | null;
  retryCount: number;
  createdDisplay: string;
};

/** SaaS e-belge kuyruğu — HYPER_ADMIN; hata nedeni, sağlayıcı referansı, kontrollü işlemler. */
export function EDocsManager({ rows }: { rows: EDocRow[] }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string; error: boolean } | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const needle = q.trim().toLocaleLowerCase("tr");
  const list = needle
    ? rows.filter((r) => `${r.buyerTitle} ${r.planLabel} ${r.orderId}`.toLocaleLowerCase("tr").includes(needle))
    : rows;

  async function act(docId: string, action: "retry" | "resend") {
    setBusy(docId + action);
    setMsg(null);
    const res = await callApi<{ doc?: unknown; emailStatus?: string }>(
      `/api/v1/platform/billing/edocs/${docId}/${action}`,
      "POST"
    );
    setBusy(null);
    if (!res.ok) {
      setMsg({ id: docId, text: res.error.message, error: true });
      return;
    }
    setDone((d) => ({ ...d, [docId]: action === "retry" ? "Yeniden denendi." : "E-posta yeniden gönderildi." }));
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="edoc-search" className="mb-1 block text-sm font-medium">Kurum adıyla ara</label>
        <input
          id="edoc-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Örn. Demo Müzik"
          className="w-full max-w-md rounded-lg border bg-[var(--color-surface)] px-3 py-2 text-sm"
          style={{ borderColor: "var(--color-border)" }}
          maxLength={120}
        />
      </div>
      {list.length === 0 ? (
        <Card><p className="text-sm text-[var(--color-text-muted)]">Kayıt bulunamadı.</p></Card>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.orderId}>
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">
                    <a className="text-[var(--color-primary)] hover:underline" href={`/platform/kurumlar/${encodeURIComponent(r.tenantId)}`}>
                      {r.buyerTitle}
                    </a>
                  </p>
                  <p className="text-sm font-bold tabular-nums">{r.totalDisplay}</p>
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {r.planLabel} ({r.interval}) · {r.periodDisplay} · {r.kindLabel} · {r.createdDisplay}
                </p>
                <p className="mt-1 text-sm">
                  Durum: <strong>{r.statusLabel}</strong> · E-posta: {r.emailLabel}
                  {r.providerRef ? <> · Ref: <code className="text-xs">{r.providerRef}</code></> : null}
                  {r.retryCount > 0 ? <> · Deneme: {r.retryCount}</> : null}
                </p>
                {r.error ? <p className="mt-1 text-sm text-[var(--color-danger)]">{r.error}</p> : null}
                {msg && msg.id === r.docId ? (
                  <p className={`mt-1 text-sm font-medium ${msg.error ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>{msg.text}</p>
                ) : null}
                {done[r.docId ?? ""] ? <p className="mt-1 text-sm text-[var(--color-success)]">{done[r.docId ?? ""]}</p> : null}
                {r.docId ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(r.status === "failed" || r.status === "manual_pending") && (
                      <Button onClick={() => act(r.docId as string, "retry")} disabled={busy !== null}>
                        {busy === r.docId + "retry" ? "Deneniyor…" : "Tekrar dene"}
                      </Button>
                    )}
                    {(r.status === "issued" || r.status === "transmitted" || r.status === "transmission_pending") && (
                      <Button onClick={() => act(r.docId as string, "resend")} disabled={busy !== null}>
                        {busy === r.docId + "resend" ? "Gönderiliyor…" : "E-postayı yeniden gönder"}
                      </Button>
                    )}
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
