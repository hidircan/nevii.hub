"use client";

/**
 * Öğrenci arşivleme (hard delete YOK) — Öğretmen arşivleme aksiyonuyla
 * (`teacher-archive-action.tsx`) aynı UX: arşivle için zorunlu onay modalı,
 * geri alma tek tıkla. `archiveStudentTool` öğretmenden farklı olarak
 * gelecekteki ders çakışması kontrolü yapmaz (öğrenci arşivlemek gelecekteki
 * dersleri iptal etmez, yalnızca listeden gizler) — bu yüzden onay metni
 * o maddeyi içermez.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw } from "lucide-react";
import { actionArchiveStudent } from "@/lib/actions";
import { Button } from "@/components/ui";

export function StudentArchiveAction({
  studentId,
  studentName,
  archived,
}: {
  studentId: string;
  studentName: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onRestore() {
    setError(null);
    startTransition(async () => {
      const result = await actionArchiveStudent({ studentId, archived: false });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function onConfirmArchive() {
    setError(null);
    startTransition(async () => {
      const result = await actionArchiveStudent({ studentId, archived: true });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (archived) {
    return (
      <div>
        <button
          type="button"
          disabled={pending}
          onClick={onRestore}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" /> {pending ? "Aktifleştiriliyor…" : "Yeniden Aktifleştir"}
        </button>
        {error ? <p className="mt-1 text-xs font-medium text-[var(--color-danger)]">{error}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-800 hover:bg-rose-100"
      >
        <Archive className="h-3.5 w-3.5" /> Arşivle
      </button>

      {open ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Öğrenciyi arşivle"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl">
            <h3 className="text-base font-semibold text-[var(--color-text)]">
              &quot;{studentName}&quot; arşivlensin mi?
            </h3>
            <ul className="mt-3 space-y-1.5 text-sm text-[var(--color-text-muted)]">
              <li>• Öğrenci aktif listeden kaldırılır.</li>
              <li>• Geçmiş yoklama, ödeme ve rapor bilgileri sistemde korunur.</li>
              <li>• Gerekirse yetkili bir yönetici öğrenciyi yeniden aktifleştirebilir.</li>
            </ul>
            {error ? (
              <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                İptal
              </Button>
              <button
                type="button"
                disabled={pending}
                onClick={onConfirmArchive}
                className="rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {pending ? "Arşivleniyor…" : "Arşivle"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
