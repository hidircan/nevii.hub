"use client";

/**
 * Öğretmen oluşturma anında haftalık müsaitlik girişi. Öncesinde müsaitlik
 * yalnızca oluşturma sonrası (Müsaitlik ekranındaki öneri/onay akışıyla)
 * belirlenebiliyordu — burada admin, ekleme formunda doğrudan gün/saat
 * seçebilir. Satırlar `name` prop'uyla verilen gizli bir input'a JSON dizisi
 * olarak yazılır (bkz. TeacherInstrumentsField ile aynı desen); boş bırakılırsa
 * createTeacherTool'daki mevcut varsayılan müsaitliğe (Pzt–Cum 10–18/16) düşülür.
 *
 * Pazar (dayOfWeek=0) dahil TÜM günler seçilebilir; herhangi bir gün için
 * (Pazar dahil) BİRDEN FAZLA saat aralığı bloğu eklenebilir (ör. Pazar
 * 09:00–12:00 + 15:00–18:00) — bu yüzden model "gün başına tek satır" değil,
 * serbest bir blok LİSTESİDİR (her blok kendi gün seçicisine sahiptir).
 * `dayName` (src/lib/utils.ts) ile aynı 0=Pazar..6=Cumartesi eşlemesi kullanılır
 * — JS `Date.getDay()` ve backend `teacherAvailabilityWindowSchema` ile birebir
 * aynı. Aynı gün içindeki bloklar arasında çakışma (overlap) engellenir.
 */

import { useState } from "react";
import { dayName } from "@/lib/utils";
import { Select, Input } from "@/components/ui";
import { Plus, Trash2 } from "lucide-react";

export type AvailabilityWindowRow = { dayOfWeek: number; start: string; end: string; branchId?: string };

/** Pzt(1)..Cts(6),Paz(0) — mevcut varsayılan sıralamayla tutarlı, Pazar sona eklendi. */
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0];

const DEFAULT_ROWS: AvailabilityWindowRow[] = [
  { dayOfWeek: 1, start: "10:00", end: "18:00" },
  { dayOfWeek: 2, start: "10:00", end: "18:00" },
  { dayOfWeek: 3, start: "10:00", end: "18:00" },
  { dayOfWeek: 4, start: "10:00", end: "18:00" },
  { dayOfWeek: 5, start: "10:00", end: "16:00" },
];

/** Aynı gün + aynı şube (ikisi de "tüm şubeler" dahil) bağlamında çakışma. */
function timesOverlap(a: AvailabilityWindowRow, b: AvailabilityWindowRow): boolean {
  return a.dayOfWeek === b.dayOfWeek && a.branchId === b.branchId && a.start < b.end && b.start < a.end;
}

export function TeacherAvailabilityField({
  name,
  initialRows,
  branches,
}: {
  /** Hidden input adı — form submit'te JSON string olarak gönderilir. */
  name: string;
  initialRows?: AvailabilityWindowRow[];
  /** Package D — şube bazlı müsaitlik seçimi için. Boş/verilmezse şube sütunu gizlenir (legacy tek-şube davranışı). */
  branches?: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState<AvailabilityWindowRow[]>(
    initialRows && initialRows.length > 0 ? initialRows : DEFAULT_ROWS
  );

  function addRow() {
    setRows((prev) => [...prev, { dayOfWeek: 1, start: "10:00", end: "18:00" }]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, patch: Partial<AvailabilityWindowRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const json = JSON.stringify(rows);

  const invalidIndexes = new Set<number>();
  const overlapIndexes = new Set<number>();
  rows.forEach((r, i) => {
    if (r.start >= r.end) invalidIndexes.add(i);
    for (let j = 0; j < rows.length; j++) {
      if (j === i) continue;
      if (timesOverlap(r, rows[j]!)) {
        overlapIndexes.add(i);
        overlapIndexes.add(j);
      }
    }
  });

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={json} />
      {rows.map((row, idx) => (
        <div key={idx} className="flex flex-wrap items-center gap-2">
          <Select
            value={row.dayOfWeek}
            onChange={(e) => updateRow(idx, { dayOfWeek: Number(e.target.value) })}
            className="!w-auto flex-1"
            aria-label="Gün"
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {dayName(d)}
              </option>
            ))}
          </Select>
          <Input
            type="time"
            value={row.start}
            onChange={(e) => updateRow(idx, { start: e.target.value })}
            className="!w-auto flex-1"
            aria-label={`${dayName(row.dayOfWeek)} başlangıç`}
          />
          <span className="text-xs text-[var(--color-text-muted)]">–</span>
          <Input
            type="time"
            value={row.end}
            onChange={(e) => updateRow(idx, { end: e.target.value })}
            className="!w-auto flex-1"
            aria-label={`${dayName(row.dayOfWeek)} bitiş`}
          />
          {branches && branches.length > 0 ? (
            <Select
              value={row.branchId ?? ""}
              onChange={(e) => updateRow(idx, { branchId: e.target.value || undefined })}
              className="!w-auto flex-1"
              aria-label={`${dayName(row.dayOfWeek)} şube`}
            >
              <option value="">Tüm şubeler</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          ) : null}
          <button
            type="button"
            onClick={() => removeRow(idx)}
            aria-label="Satırı sil"
            className="rounded-md border border-stone-300 p-1.5 text-stone-500 hover:border-rose-300 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {invalidIndexes.size > 0 ? (
        <p className="text-[11px] font-medium text-[var(--color-danger)]" role="alert">
          Bitiş saati başlangıçtan sonra olmalı.
        </p>
      ) : null}
      {overlapIndexes.size > 0 ? (
        <p className="text-[11px] font-medium text-[var(--color-danger)]" role="alert">
          Aynı gün için çakışan saat aralıkları var — lütfen düzeltin.
        </p>
      ) : null}
      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-stone-300 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"
      >
        <Plus className="h-3.5 w-3.5" /> Saat Aralığı Ekle
      </button>
    </div>
  );
}
