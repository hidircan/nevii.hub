"use client";

/**
 * ÖNCELİK 4 (devam) — öğretmen detayında çoklu enstrüman+seviye düzenleme.
 * Yalnızca SCHOOL_ADMIN/SUPER_ADMIN render edilir (çağıran taraftan
 * kontrol edilir); backend'de de yalnız bu roller yazabilir
 * (updateTeacherInstrumentsTool RBAC'ı) — bu bileşen ikinci bir savunma
 * katmanıdır, tek kaynak değildir.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionUpdateTeacherInstruments } from "@/lib/actions";
import { TeacherInstrumentsField, type InstrumentSkillRow } from "./teacher-instruments-field";
import type { Instrument } from "@/lib/types";

export function TeacherInstrumentsEditor({
  teacherId,
  initialRows,
  instrumentOptions,
  onSaved,
}: {
  teacherId: string;
  initialRows: InstrumentSkillRow[];
  instrumentOptions: Instrument[];
  /** Called after a successful save (e.g. to collapse the section back to read-only). */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<InstrumentSkillRow[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const hasDuplicates = new Set(rows.map((r) => r.instrument)).size !== rows.length;

  function onSave() {
    if (hasDuplicates) {
      setError("Aynı enstrüman birden fazla kez eklenemez.");
      return;
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await actionUpdateTeacherInstruments({ teacherId, instrumentLevels: rows });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <TeacherInstrumentsField
        name="instrumentLevelsJson_unused"
        initialRows={initialRows}
        onChange={setRows}
        instrumentOptions={instrumentOptions}
      />
      {error ? <p className="mt-1 text-[11px] font-medium text-[var(--color-danger)]">{error}</p> : null}
      {saved && !pending ? <p className="mt-1 text-[11px] text-emerald-700">Kaydedildi.</p> : null}
      <button
        type="button"
        disabled={pending || hasDuplicates}
        onClick={onSave}
        className="mt-2 rounded-md border border-stone-300 bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-stone-800 hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
      >
        {pending ? "Kaydediliyor…" : "Enstrümanları kaydet"}
      </button>
    </div>
  );
}
