"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * Faz 11 — mesaj tam içeriği yalnızca istek üzerine (audit'li) gösterilir.
 * `StaffIbanReveal`/`NationalIdReveal` ile AYNI desen — liste özet taşır,
 * "Göster" tam içeriği çeker.
 */
export function CrmMessageReveal({ messageId, summary }: { messageId: string; summary: string }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onReveal() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/crm/messages/${messageId}`);
      const json = (await res.json()) as { ok: boolean; data?: { message: { contentOrSummary: string } }; error?: { message: string } };
      if (!json.ok || !json.data) {
        setError(json.error?.message || "Görüntülenemedi");
        return;
      }
      setRevealed(json.data.message.contentOrSummary);
    } catch {
      setError("Bağlantı hatası");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-[var(--color-text-muted)]">{revealed ?? summary}</span>
      {!revealed ? (
        <Button variant="ghost" className="!px-2 !py-0.5 !text-[11px]" disabled={busy} onClick={() => void onReveal()}>
          {busy ? "…" : "Göster"}
        </Button>
      ) : null}
      {error ? <span className="text-[11px] text-[var(--color-danger)]">{error}</span> : null}
    </div>
  );
}
