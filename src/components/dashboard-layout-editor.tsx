"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, LayoutGrid } from "lucide-react";
import { actionSaveDashboardLayout } from "@/lib/actions";
import {
  DASHBOARD_SECTION_LABELS,
  DASHBOARD_SPAN_OPTIONS,
  getDefaultDashboardLayout,
  type DashboardSectionKey,
  type DashboardSectionSpan,
} from "@/lib/dashboard/layout-prefs";

type EditorRow = {
  key: DashboardSectionKey;
  hidden: boolean;
  span: DashboardSectionSpan;
};

/**
 * Günlük Özet düzen editörü — kurumsal, sakin UI.
 * Her değişiklik hesaba otomatik kaydedilir (`UserPreference.dashboardJson`).
 *
 * Sunucu props değişince yeniden mount için parent `key` verir; local state
 * effect ile senkron edilmez (cascading render lint kuralı).
 */
export function DashboardLayoutEditor({
  role,
  initialOrder,
  initialHidden,
  initialSpans,
}: {
  role: string;
  initialOrder: DashboardSectionKey[];
  initialHidden: DashboardSectionKey[];
  initialSpans: Partial<Record<DashboardSectionKey, DashboardSectionSpan>>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [savedNote, setSavedNote] = useState(false);
  const [rows, setRows] = useState<EditorRow[]>(() => buildRows(initialOrder, initialHidden, initialSpans));

  useEffect(() => {
    if (!savedNote) return;
    const t = window.setTimeout(() => setSavedNote(false), 1600);
    return () => window.clearTimeout(t);
  }, [savedNote]);

  function persist(next: EditorRow[], resetToDefault = false) {
    setRows(next);
    startTransition(async () => {
      if (resetToDefault) {
        await actionSaveDashboardLayout({ resetToDefault: true });
      } else {
        await actionSaveDashboardLayout({
          sectionOrder: next.map((r) => r.key),
          hiddenSections: next.filter((r) => r.hidden).map((r) => r.key),
          sectionSpans: Object.fromEntries(next.map((r) => [r.key, r.span])),
        });
      }
      setSavedNote(true);
      router.refresh();
    });
  }

  function toggleVisible(index: number) {
    const next = rows.map((r, i) => (i === index ? { ...r, hidden: !r.hidden } : r));
    persist(next);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    persist(next);
  }

  function setSpan(index: number, span: DashboardSectionSpan) {
    const next = rows.map((r, i) => (i === index ? { ...r, span } : r));
    persist(next);
  }

  function resetToDefault() {
    const defaults = getDefaultDashboardLayout(role);
    persist(
      defaults.order.map((key) => ({
        key,
        hidden: false,
        span: defaults.spans[key],
      })),
      true
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="dashboard-layout-editor"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
        Düzeni düzenle
      </button>

      {open ? (
        <div
          id="dashboard-layout-editor"
          className="absolute right-0 z-20 mt-2 w-[min(100vw-2rem,22rem)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">Günlük özet düzeni</p>
              <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                Değişiklikler hesabınıza otomatik kaydedilir.
              </p>
            </div>
            {savedNote ? (
              <span className="shrink-0 text-[11px] font-medium" style={{ color: "var(--color-success)" }}>
                Kaydedildi
              </span>
            ) : pending ? (
              <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">Kaydediliyor…</span>
            ) : null}
          </div>

          <ul className="divide-y divide-[var(--color-border)]">
            {rows.map((row, index) => (
              <li key={row.key} className="flex flex-col gap-1.5 py-2">
                <div className="flex items-center gap-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[var(--color-text)]">
                    <input
                      type="checkbox"
                      checked={!row.hidden}
                      onChange={() => toggleVisible(index)}
                      disabled={pending}
                      className="rounded border-[var(--color-border-strong)]"
                    />
                    <span className="truncate font-medium">{DASHBOARD_SECTION_LABELS[row.key]}</span>
                  </label>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      aria-label="Yukarı taşı"
                      disabled={pending || index === 0}
                      onClick={() => move(index, -1)}
                      className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label="Aşağı taşı"
                      disabled={pending || index === rows.length - 1}
                      onClick={() => move(index, 1)}
                      className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
                <div className="pl-6">
                  <label className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                    <span className="shrink-0">Boyut</span>
                    <select
                      value={row.span}
                      disabled={pending || row.hidden}
                      onChange={(e) => setSpan(index, Number(e.target.value) as DashboardSectionSpan)}
                      className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] disabled:opacity-50"
                    >
                      {DASHBOARD_SPAN_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2">
            <button
              type="button"
              disabled={pending}
              onClick={resetToDefault}
              className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] disabled:opacity-50"
            >
              Varsayılana dön
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:border-[var(--color-primary)]"
            >
              Kapat
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildRows(
  order: DashboardSectionKey[],
  hidden: DashboardSectionKey[],
  spans: Partial<Record<DashboardSectionKey, DashboardSectionSpan>>
): EditorRow[] {
  const hiddenSet = new Set(hidden);
  const defaults = getDefaultDashboardLayout("SUPER_ADMIN").spans;
  return order.map((key) => ({
    key,
    hidden: hiddenSet.has(key),
    span: spans[key] ?? defaults[key],
  }));
}
