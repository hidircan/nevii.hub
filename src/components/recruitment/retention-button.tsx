"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionRunRetentionSweep } from "@/lib/recruitment/actions";

export function RetentionButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(`${count} başvurunun saklama süresi doldu. Kişisel verileri ve CV'leri kalıcı olarak silinecek (istatistik kalır). Devam edilsin mi?`)) return;
          start(async () => {
            const r = await actionRunRetentionSweep();
            setMsg(r.ok ? `${r.data.anonymized} başvuru anonimleştirildi.` : r.message);
            router.refresh();
          });
        }}
        className="rounded-[var(--radius-md)] bg-[var(--color-warning)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "İşleniyor…" : "Şimdi anonimleştir"}
      </button>
      {msg ? <span className="text-sm">{msg}</span> : null}
    </div>
  );
}
