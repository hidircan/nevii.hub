"use client";

/**
 * ÖNCELİK 4 (devam) — öğretmen çoklu enstrüman + seviye. Satır satır
 * enstrüman/seviye ekler; aynı enstrüman ikinci kez seçilemez (anlaşılır
 * Türkçe hata). Sonuç, `name` prop'uyla verilen gizli bir input'a JSON
 * dizisi olarak yazılır — form submit olduğunda sunucu tarafı
 * (actionAddTeacher / actionUpdateTeacherInstruments) bunu ayrıştırır.
 */

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { INSTRUMENTS, type Instrument } from "@/lib/types";
import { Select } from "@/components/ui";

export type InstrumentLevel = "Başlangıç" | "Orta" | "İleri";
export const INSTRUMENT_LEVELS: InstrumentLevel[] = ["Başlangıç", "Orta", "İleri"];

export type InstrumentSkillRow = { instrument: Instrument; level: InstrumentLevel };

export function TeacherInstrumentsField({
  name,
  initialRows,
  onChange,
  instrumentOptions,
}: {
  /** Hidden input adı — form submit'te JSON string olarak gönderilir. */
  name: string;
  initialRows?: InstrumentSkillRow[];
  onChange?: (rows: InstrumentSkillRow[]) => void;
  /** ÖNCELİK 4 (devam) — Enstrüman Kataloğu; verilmezse sabit `INSTRUMENTS`. */
  instrumentOptions?: Instrument[];
}) {
  const options = instrumentOptions?.length ? instrumentOptions : INSTRUMENTS;
  const [rows, setRows] = useState<InstrumentSkillRow[]>(
    initialRows && initialRows.length > 0 ? initialRows : [{ instrument: options[0]!, level: "Başlangıç" }]
  );

  useEffect(() => {
    onChange?.(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const usedInstruments = new Set(rows.map((r) => r.instrument));
  const duplicateIndexes = new Set<number>();
  rows.forEach((r, i) => {
    if (rows.findIndex((x) => x.instrument === r.instrument) !== i) duplicateIndexes.add(i);
  });

  function addRow() {
    const next = options.find((i) => !usedInstruments.has(i)) ?? options[0]!;
    setRows((prev) => [...prev, { instrument: next, level: "Başlangıç" }]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, patch: Partial<InstrumentSkillRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      {rows.map((row, idx) => (
        <div key={idx} className="flex flex-wrap items-center gap-2">
          <Select
            value={row.instrument}
            onChange={(e) => updateRow(idx, { instrument: e.target.value as Instrument })}
            className="!w-auto flex-1"
            aria-label="Enstrüman"
          >
            {options.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </Select>
          <Select
            value={row.level}
            onChange={(e) => updateRow(idx, { level: e.target.value as InstrumentLevel })}
            className="!w-auto flex-1"
            aria-label="Seviye"
          >
            {INSTRUMENT_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => removeRow(idx)}
            disabled={rows.length === 1}
            aria-label="Satırı sil"
            className="rounded-md border border-stone-300 p-1.5 text-stone-500 hover:border-rose-300 hover:text-rose-600 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {duplicateIndexes.size > 0 ? (
        <p className="text-[11px] font-medium text-[var(--color-danger)]" role="alert">
          Aynı enstrüman birden fazla kez eklenemez — lütfen yinelenen satırları düzeltin.
        </p>
      ) : null}
      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-stone-300 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"
      >
        <Plus className="h-3.5 w-3.5" /> Enstrüman Ekle
      </button>
    </div>
  );
}
