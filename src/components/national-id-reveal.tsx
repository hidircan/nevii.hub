"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * T.C. kimlik — listede hiç gösterilmez, detayda maskeli; yalnızca yetkili
 * rol (pii:full) "Göster" ile tam değeri görebilir. Her görüntüleme
 * revealNationalIdTool tarafından audit'lenir (server tarafı).
 */
export function NationalIdReveal({
  entity,
  entityId,
  masked,
  canReveal,
}: {
  entity: "student" | "teacher" | "staff";
  entityId: string;
  masked: string;
  canReveal: boolean;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onReveal() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/people/reveal-national-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, entityId }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { nationalId: string };
        error?: { message: string };
      };
      if (!json.ok || !json.data) {
        setError(json.error?.message || "Görüntülenemedi");
        return;
      }
      setRevealed(json.data.nationalId);
    } catch {
      setError("Bağlantı hatası");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm text-[var(--color-text)]">{revealed ?? masked}</span>
      {canReveal && !revealed ? (
        <Button variant="ghost" className="!px-2 !py-0.5 !text-[11px]" disabled={busy} onClick={() => void onReveal()}>
          {busy ? "…" : "Göster"}
        </Button>
      ) : null}
      {error ? <span className="text-[11px] text-[var(--color-danger)]">{error}</span> : null}
    </div>
  );
}
