"use client";

/**
 * Öğrenciler ekranı — "Sütunlar / Görünüm yönetimi". Kolon görünürlüğü ve
 * sırası bu bileşende yönetilir; ebeveyn (`students-table.tsx`) `columns`
 * (görünür kolon anahtarları, sırayla) state'ini tutar ve tabloyu ona göre
 * render eder — burada yalnızca DÜZENLEME arayüzü var, filtre/arama/sıralama
 * mantığına dokunmaz.
 *
 * Kalıcılık iki katmanlı:
 *  - "Son kullanılan" — kişiye özel, sidebar sırası/tema tercihi ile AYNI
 *    ilkeyle `localStorage`'da tutulur (bkz. CLAUDE.md "Notable conventions"
 *    ve sidebar-order precedent) — sunucuya yazma gerektirmez.
 *  - İsimli "Görünüm"ler — tenant içindeki TÜM SCHOOL_ADMIN/SUPER_ADMIN'ler
 *    tarafından paylaşılır (Prisma `StudentListView`, bkz.
 *    src/lib/services/tools.ts saveStudentListViewTool/listStudentListViewsTool).
 */

import { useEffect, useId, useRef, useState } from "react";
import { Columns3, GripVertical } from "lucide-react";
import { actionDeleteStudentListView, actionListStudentListViews, actionSaveStudentListView } from "@/lib/actions";

export type StudentColumnKey =
  | "branch"
  | "type"
  | "instruments"
  | "teacher"
  | "package"
  | "level"
  | "method"
  | "payment"
  | "monthlyFee"
  /** D — güncel sözleşmenin durumu + bitiş tarihi (2026-09-20). */
  | "contract"
  /** F — kurum içi öğrenci numarası (displayId). */
  | "displayId"
  /** F — kaydı oluşturan kullanıcı (+ denemeden dönüştüyse dönüştüren). */
  | "createdBy";

export const STUDENT_COLUMN_LABELS: Record<StudentColumnKey, string> = {
  branch: "Şube",
  type: "Tür / Seviye",
  instruments: "Enstrüman",
  teacher: "Öğretmen",
  package: "Paket",
  level: "MEB/LCM seviye",
  method: "Eğitim metodu",
  payment: "Ödeme durumu",
  monthlyFee: "Aylık ücret",
  contract: "Sözleşme",
  displayId: "Öğrenci no",
  createdBy: "Kaydı oluşturan",
};

export const DEFAULT_STUDENT_COLUMNS: StudentColumnKey[] = ["branch", "type", "instruments", "teacher", "package"];
const ALL_STUDENT_COLUMNS: StudentColumnKey[] = [
  "branch",
  "type",
  "instruments",
  "teacher",
  "package",
  "level",
  "method",
  "payment",
  "monthlyFee",
  "contract",
  "displayId",
  "createdBy",
];

function storageKey(tenantId: string, userId: string) {
  return `notaplan_student_columns_${tenantId}_${userId}`;
}

/** localStorage'daki son kullanılan kolon düzenini okur (yalnızca bilinen anahtarlar, sırayı korur). */
export function loadLastUsedStudentColumns(tenantId: string, userId: string): StudentColumnKey[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.filter((k): k is StudentColumnKey => ALL_STUDENT_COLUMNS.includes(k as StudentColumnKey));
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

function saveLastUsedStudentColumns(tenantId: string, userId: string, columns: StudentColumnKey[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(tenantId, userId), JSON.stringify(columns));
  } catch {
    // localStorage kullanılamıyor (gizli mod vb.) — sessizce yok say, kişisel bir tercih kaybolur, veri kaybı yok.
  }
}

type SharedView = { id: string; name: string; columns: string[]; createdByUserId: string };

export function StudentColumnViewManager({
  tenantId,
  userId,
  columns,
  onChange,
}: {
  tenantId: string;
  userId: string;
  columns: StudentColumnKey[];
  onChange: (columns: StudentColumnKey[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SharedView[]>([]);
  const [newViewName, setNewViewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    void actionListStudentListViews().then((res) => {
      if (res.ok) setViews(res.views);
    });
  }, [open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function applyColumns(next: StudentColumnKey[]) {
    onChange(next);
    saveLastUsedStudentColumns(tenantId, userId, next);
  }

  function toggleColumn(key: StudentColumnKey) {
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

  function onSaveView() {
    const name = newViewName.trim();
    if (!name) return;
    setError(null);
    void actionSaveStudentListView({ name, columns }).then((res) => {
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setNewViewName("");
      void actionListStudentListViews().then((r) => {
        if (r.ok) setViews(r.views);
      });
    });
  }

  function onSelectView(view: SharedView) {
    const next = view.columns.filter((c): c is StudentColumnKey => ALL_STUDENT_COLUMNS.includes(c as StudentColumnKey));
    applyColumns(next);
  }

  function onDeleteView(id: string) {
    void actionDeleteStudentListView({ id }).then((res) => {
      if (res.ok) setViews((prev) => prev.filter((v) => v.id !== id));
    });
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
        Sütunlar / Görünüm
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Sütunlar ve görünüm yönetimi"
          className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] w-full overflow-y-auto rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-md)] sm:absolute sm:inset-auto sm:top-full sm:bottom-auto sm:mt-2 sm:w-80 sm:rounded-[var(--radius-lg)]"
        >
          <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">Görünür kolonlar (sürükleyip sırala)</p>
          <ul className="mb-3 space-y-1" id={listId}>
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
                <span className="flex-1">{STUDENT_COLUMN_LABELS[key]}</span>
                <button
                  type="button"
                  onClick={() => toggleColumn(key)}
                  aria-label={`${STUDENT_COLUMN_LABELS[key]} kolonunu gizle`}
                  className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                >
                  Gizle
                </button>
              </li>
            ))}
          </ul>

          {ALL_STUDENT_COLUMNS.some((k) => !columns.includes(k)) ? (
            <div className="mb-3">
              <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">Gizli kolonlar</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_STUDENT_COLUMNS.filter((k) => !columns.includes(k)).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleColumn(key)}
                    className="rounded-full border border-[var(--color-border-strong)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
                  >
                    + {STUDENT_COLUMN_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="border-t border-[var(--color-border)] pt-3">
            <p className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">Görünüm olarak kaydet (paylaşılır)</p>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="Görünüm adı"
                className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
              />
              <button
                type="button"
                onClick={onSaveView}
                disabled={!newViewName.trim()}
                className="shrink-0 rounded-md bg-[var(--color-primary)] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                Kaydet
              </button>
            </div>
            {error ? <p className="mt-1 text-xs font-medium text-[var(--color-danger)]">{error}</p> : null}
          </div>

          {views.length > 0 ? (
            <div className="mt-3 border-t border-[var(--color-border)] pt-3">
              <p className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">Kaydedilmiş görünümler</p>
              <ul className="space-y-1">
                {views.map((view) => (
                  <li key={view.id} className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectView(view)}
                      className="flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                    >
                      {view.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteView(view.id)}
                      aria-label={`${view.name} görünümünü sil`}
                      className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                    >
                      Sil
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => applyColumns(DEFAULT_STUDENT_COLUMNS)}
            className="mt-3 w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
          >
            Varsayılana sıfırla
          </button>
        </div>
      ) : null}
    </div>
  );
}
