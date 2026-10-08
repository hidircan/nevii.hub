"use client";

/**
 * 2026-10-09 — "Branşa bağla": branşı belirtilmemiş eski bir sözleşmeyi (sürüm zinciriyle) veya sözleşmesiz ödeme
 * satırını kullanıcının AÇIK seçimiyle bir branş kaydına bağlar. Sunucu yalnız bağsız kaydı bağlar (taşıma yok).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionAssignRecordEnrollment } from "@/lib/actions";

export function AssignEnrollmentControl({
  studentId,
  contractId,
  paymentId,
  branches,
}: {
  studentId: string;
  contractId?: string;
  paymentId?: string;
  branches: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    if (!value) {
      setMessage({ ok: false, text: "Bağlanacak branşı seçin." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await actionAssignRecordEnrollment({ studentId, enrollmentId: value, contractId, paymentId });
    setBusy(false);
    setMessage({ ok: res.ok, text: res.message });
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-[var(--color-primary)] hover:underline">
          Branşa bağla
        </button>
        {message ? (
          <span role="status" className={`text-xs ${message.ok ? "text-[var(--color-success)]" : "text-rose-600"}`}>
            {message.text}
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <select
        aria-label="Bağlanacak branş"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
      >
        <option value="">Branş seçin</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="rounded-md bg-[var(--color-primary)] px-2 py-1 font-medium text-[var(--color-text-inverted)] disabled:opacity-60"
      >
        {busy ? "Bağlanıyor…" : "Bağla"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-[var(--color-text-muted)] hover:underline">
        Vazgeç
      </button>
      {message && !message.ok ? <span role="alert" className="text-rose-600">{message.text}</span> : null}
    </span>
  );
}
