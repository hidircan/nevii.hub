"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionArchiveStudent } from "@/lib/actions";
import { Button } from "@/components/ui";

/** Pasife alma/aktifleştirme — kalıcı silme yok, onay adımı zorunlu. */
export function StudentArchiveToggle({ studentId, active }: { studentId: string; active: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    const result = await actionArchiveStudent({ studentId, archived: active });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] px-3 py-1.5">
        <span className="text-xs font-medium text-[var(--color-text)]">
          {active ? "Öğrenciyi pasife almak istediğinize emin misiniz?" : "Öğrenciyi aktifleştirmek istediğinize emin misiniz?"}
        </span>
        <Button variant={active ? "danger" : "success"} className="!px-2.5 !py-1 !text-xs" disabled={busy} onClick={() => void onConfirm()}>
          {busy ? "…" : "Evet"}
        </Button>
        <Button variant="ghost" className="!px-2.5 !py-1 !text-xs" disabled={busy} onClick={() => setConfirming(false)}>
          Vazgeç
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Button variant={active ? "danger" : "success"} className="!text-xs" onClick={() => setConfirming(true)}>
        {active ? "Pasife Al" : "Aktifleştir"}
      </Button>
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
