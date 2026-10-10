"use client";

/**
 * MEB Paneli — "Sütunlar" yönetimi. Öğrenciler ekranındaki
 * `student-column-view-manager.tsx` deseninin birebir aynısıdır (aç/kapa +
 * sürükle-sırala + kişiye özel localStorage + sıfırlama), yalnız MEB
 * kolon anahtarlarıyla. İsimli/paylaşılan görünüm YOK (yerel tercih yeterli).
 */

import { useRef, useState } from "react";
import { Columns3, GripVertical } from "lucide-react";

export type MebColumnKey =
  /** Kurum içi öğrenci numarası — varsayılan ilk sütun. */
  | "displayId"
  | "branch"
  | "instruments"
  | "teacher"
  | "type"
  | "mebLevelStartDate"
  | "mebLevelEndDate"
  | "level"
  | "mebExamDate"
  | "examStatus";

export const MEB_COLUMN_LABELS: Record<MebColumnKey, string> = {
  displayId: "Öğrenci no",
  branch: "Şube",
  instruments: "Enstrüman",
  teacher: "Öğretmen",
  type: "Türler",
  mebLevelStartDate: "Dönem başlangıcı",
  mebLevelEndDate: "Dönem bitişi",
  level: "MEB seviyesi",
  mebExamDate: "Sınav tarihi",
  examStatus: "Sınav durumu",
};

export const DEFAULT_MEB_COLUMNS: MebColumnKey[] = [
  "displayId",
  "branch",
  "instruments",
  "teacher",
  "mebLevelStartDate",
  "mebLevelEndDate",
  "level",
  "mebExamDate",
  "examStatus",
];

const ALL_MEB_COLUMNS: MebColumnKey[] = [
  "displayId",
  "branch",
  "instruments",
  "teacher",
  "type",
  "mebLevelStartDate",
  "mebLevelEndDate",
  "level",
  "mebExamDate",
  "examStatus",
];

function storageKey(tenantId: string, userId: string) {
  return `notaplan_meb_columns_${tenantId}_${userId}`;
}

/** localStorage'daki son kullanılan MEB kolon düzenini okur (yalnızca bilinen anahtarlar). */
export function loadLastUsedMebColumns(tenantId: string, userId: string): MebColumnKey[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.filter((k): k is MebColumnKey => ALL_MEB_COLUMNS.includes(k as MebColumnKey));
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

function saveLastUsedMebColumns(tenantId: string, userId: string, columns: MebColumnKey[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(tenantId, userId), JSON.stringify(columns));
  } catch {
    // localStorage kullanılamıyor — sessizce yok say, kişisel tercih kaybolur, veri kaybı yok.
  }
}

export function MebColumnViewManager({
  tenantId,
  userId,
  columns,
  onChange,
}: {
  tenantId: string;
  userId: string;
  columns: MebColumnKey[];
  onChange: (columns: MebColumnKey[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function applyColumns(next: MebColumnKey[]) {
    onChange(next);
    saveLastUsedMebColumns(tenantId, userId, next);
  }

  function toggleColumn(key: MebColumnKey) {
    const next = columns.includes(key) ? columns.filter((c) => c !== key) : [...columns, key];
    applyColumns(next);
  }

  function moveColumn(from: number, to: number) {
    if (to < 0 || to >= columns.length || from === to) return;
    const next = [...columns];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    applyColumns(next);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]"
      >
        <Columns3 className="h-4 w-4" aria-hidden />
        Sütunlar
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="MEB tablo sütunları"
          className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] w-full overflow-y-auto rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-md)] sm:absolute sm:inset-auto sm:top-full sm:bottom-auto sm:right-0 sm:mt-2 sm:w-80 sm:rounded-[var(--radius-lg)]"
        >
          <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">Görünür kolonlar (sürükleyip sırala)</p>
          <ul className="mb-3 space-y-1">
            {columns.map((key, index) => (
              <li
                key={key}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null) moveColumn(dragIndex, index);
                  setDragIndex(null);
                }}
                className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 py-1.5 text-sm text-[var(--color-text)]"
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                <span className="flex-1">{MEB_COLUMN_LABELS[key]}</span>
                <button
                  type="button"
                  onClick={() => toggleColumn(key)}
                  aria-label={`${MEB_COLUMN_LABELS[key]} kolonunu gizle`}
                  className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                >
                  Gizle
                </button>
              </li>
            ))}
          </ul>

          {ALL_MEB_COLUMNS.some((k) => !columns.includes(k)) ? (
            <div className="mb-3">
              <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">Gizli kolonlar</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_MEB_COLUMNS.filter((k) => !columns.includes(k)).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleColumn(key)}
                    className="rounded-full border border-[var(--color-border-strong)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
                  >
                    + {MEB_COLUMN_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => applyColumns(DEFAULT_MEB_COLUMNS)}
            className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
          >
            Varsayılana sıfırla
          </button>
        </div>
      ) : null}
    </div>
  );
}
