"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, EyeOff, GripVertical, LayoutGrid, Plus, RotateCcw } from "lucide-react";
import { actionSaveDashboardLayout } from "@/lib/actions";
import {
  DASHBOARD_MAX_SPAN,
  DASHBOARD_MIN_SPAN,
  DASHBOARD_ROW_UNIT_PX,
  DASHBOARD_SECTION_LABELS,
  dashboardRowSpan,
  clampDashboardSpan,
  getDefaultDashboardLayout,
  mergeSectionOrder,
  type DashboardSectionKey,
  type DashboardSectionSpan,
} from "@/lib/dashboard/layout-prefs";
import type { DashboardSavedView } from "@/lib/user-preferences";

type Row = { key: DashboardSectionKey; hidden: boolean; span: DashboardSectionSpan };

/** Tailwind sınıfları derleme anında görünür olmalı — dinamik string üretilmez. */
const SPAN_CLASS: Record<DashboardSectionSpan, string> = {
  3: "xl:col-span-3",
  4: "xl:col-span-4",
  5: "xl:col-span-5",
  6: "xl:col-span-6",
  7: "xl:col-span-7",
  8: "xl:col-span-8",
  9: "xl:col-span-9",
  10: "xl:col-span-10",
  11: "xl:col-span-11",
  12: "xl:col-span-12",
};

/** xl kırılımı (1280px) altında ızgara tek kolondur → boyutlandırma anlamsız, yalnız sıralama açık. */
const XL_QUERY = "(min-width: 1280px)";

/**
 * Günlük Özet ızgarası + gerçek düzenleme modu.
 *
 * Görüntü modu: bölümler kayıtlı sıra/genişlikle 12 kolon `grid-flow-dense` ızgarada.
 * Düzenleme modu: taslak üzerinde çalışılır (sunucuya hiçbir şey yazılmaz)
 *  - tutamaktan tutup sürükle → canlı yer değiştirme (pointer events; fare + dokunmatik)
 *  - sağ kenardan tutup sürükle → kolon genişliği 4–12 arasında ızgaraya oturur
 *  - klavye: tutamak odaktayken ←/→ genişlik, ↑/↓ sıra
 *  - Kaydet → kullanıcı tercihi; İptal → açılıştaki düzen; Varsayılana dön → rol varsayılanı (taslağa)
 * Bölüm içeriği (şube/rol filtreli) sunucuda üretilir; bu bileşen yalnız yerleşimi yönetir.
 */
export function DashboardGrid({
  role,
  sections,
  initialOrder,
  initialHidden,
  initialSpans,
  initialSavedViews,
  initialActiveViewId,
  leading,
}: {
  /** Aynı satırda solda gösterilecek araç (ör. şube seçici) — dikey boşluk harcanmaz. */
  leading?: ReactNode;
  role: string;
  sections: Partial<Record<DashboardSectionKey, ReactNode>>;
  initialOrder: DashboardSectionKey[];
  initialHidden: DashboardSectionKey[];
  initialSpans: Record<DashboardSectionKey, DashboardSectionSpan>;
  initialSavedViews: DashboardSavedView[];
  initialActiveViewId?: string;
}) {
  const router = useRouter();
  const [committed, setCommitted] = useState<Row[]>(() => buildRows(initialOrder, initialHidden, initialSpans));
  const [rows, setRows] = useState<Row[]>(committed);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [views, setViews] = useState(initialSavedViews);
  const [activeViewId, setActiveViewId] = useState<string | undefined>(initialActiveViewId);
  const [viewName, setViewName] = useState("");
  const [dragKey, setDragKey] = useState<DashboardSectionKey | null>(null);
  const [resizeKey, setResizeKey] = useState<DashboardSectionKey | null>(null);
  const [isWide, setIsWide] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const dirty = editing && !sameRows(rows, committed);

  useEffect(() => {
    const mq = window.matchMedia(XL_QUERY);
    const sync = () => setIsWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Kaydedilmemiş düzenle sayfadan çıkarken tarayıcı uyarısı.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const visibleRows = rows.filter((r) => !r.hidden && sections[r.key] != null);

  // ---- masonry (yalnız xl): kart yüksekliği ölç → grid-row span ----
  const [rowSpans, setRowSpans] = useState<Partial<Record<DashboardSectionKey, number>>>({});
  const visibleKeySig = visibleRows.map((r) => r.key).join(",");
  useEffect(() => {
    const grid = gridRef.current;
    if (!isWide || !grid) return;
    const ro = new ResizeObserver((entries) => {
      setRowSpans((prev) => {
        let next = prev;
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.measureKey as DashboardSectionKey;
          const span = dashboardRowSpan(entry.target.getBoundingClientRect().height);
          if (next[key] !== span) {
            if (next === prev) next = { ...prev };
            next[key] = span;
          }
        }
        return next;
      });
    });
    grid.querySelectorAll<HTMLElement>("[data-measure-key]").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [isWide, editing, visibleKeySig]);
  // Tüm kartlar ölçülmeden masonry açılmaz — ölçülmemiş kart 4px'lik ize sığmaz, üst üste binerdi.
  const masonry = isWide && visibleRows.every((r) => rowSpans[r.key] !== undefined);
  const rowStyle = (key: DashboardSectionKey) => (masonry ? { gridRowEnd: `span ${rowSpans[key]}` } : undefined);
  const hiddenRows = rows.filter((r) => r.hidden && sections[r.key] != null);

  // ---- sürükle-bırak (sıra) ----
  const onHandlePointerDown = useCallback(
    (key: DashboardSectionKey) => (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragKey(key);
    },
    []
  );

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragKey) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-dash-key]");
      const overKey = el?.dataset.dashKey as DashboardSectionKey | undefined;
      if (!overKey || overKey === dragKey) return;
      setRows((prev) => {
        const from = prev.findIndex((r) => r.key === dragKey);
        const to = prev.findIndex((r) => r.key === overKey);
        if (from < 0 || to < 0) return prev;
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        return next;
      });
    },
    [dragKey]
  );

  const endDrag = useCallback(() => setDragKey(null), []);

  // ---- kenardan boyutlandırma ----
  const onResizePointerDown = (row: Row) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !gridRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const gap = parseFloat(getComputedStyle(gridRef.current).columnGap) || 0;
    const colWidth = (gridRef.current.clientWidth - gap * 11) / 12 + gap;
    const startX = e.clientX;
    const startSpan = row.span;
    setResizeKey(row.key);
    const move = (ev: PointerEvent) => {
      const span = clampDashboardSpan(startSpan + (ev.clientX - startX) / colWidth);
      setRows((prev) => prev.map((r) => (r.key === row.key && r.span !== span ? { ...r, span } : r)));
    };
    const up = () => {
      setResizeKey(null);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  function moveBy(key: DashboardSectionKey, dir: -1 | 1) {
    setRows((prev) => {
      const visible = prev.filter((r) => !r.hidden);
      const vi = visible.findIndex((r) => r.key === key);
      const target = visible[vi + dir];
      if (!target) return prev;
      const next = [...prev];
      const a = next.findIndex((r) => r.key === key);
      const b = next.findIndex((r) => r.key === target.key);
      [next[a], next[b]] = [next[b]!, next[a]!];
      return next;
    });
  }

  function resizeBy(key: DashboardSectionKey, delta: number) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, span: clampDashboardSpan(r.span + delta) } : r)));
  }

  function setHidden(key: DashboardSectionKey, hidden: boolean) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, hidden } : r)));
  }

  function onHandleKeyDown(key: DashboardSectionKey) {
    return (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp") moveBy(key, -1);
      else if (e.key === "ArrowDown") moveBy(key, 1);
      else if (e.key === "ArrowLeft" && isWide) resizeBy(key, -1);
      else if (e.key === "ArrowRight" && isWide) resizeBy(key, 1);
      else return;
      e.preventDefault();
    };
  }

  function startEdit() {
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setRows(committed);
    setEditing(false);
    setError(null);
  }

  function resetToDefault() {
    const d = getDefaultDashboardLayout(role);
    setRows(d.order.map((key) => ({ key, hidden: false, span: d.spans[key] })));
  }

  function save(extra?: { savedViews?: DashboardSavedView[]; activeViewId?: string | null }) {
    const draft = rows;
    setError(null);
    startTransition(async () => {
      const res = await actionSaveDashboardLayout({
        sectionOrder: draft.map((r) => r.key),
        hiddenSections: draft.filter((r) => r.hidden).map((r) => r.key),
        sectionSpans: Object.fromEntries(draft.map((r) => [r.key, r.span])),
        savedViews: extra?.savedViews ?? views,
        activeViewId: extra && "activeViewId" in extra ? (extra.activeViewId ?? null) : (activeViewId ?? null),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCommitted(draft);
      if (extra?.savedViews) setViews(extra.savedViews);
      if (extra && "activeViewId" in extra) setActiveViewId(extra.activeViewId ?? undefined);
      setEditing(false);
      router.refresh();
    });
  }

  function saveAsView() {
    const name = viewName.trim();
    if (!name) return;
    const id = `v_${Math.random().toString(36).slice(2, 10)}`;
    const shot = {
      sectionOrder: rows.map((r) => r.key),
      hiddenSections: rows.filter((r) => r.hidden).map((r) => r.key),
      sectionSpans: Object.fromEntries(rows.map((r) => [r.key, r.span])) as DashboardSavedView["sectionSpans"],
    };
    setViewName("");
    save({ savedViews: [...views, { id, name, ...shot }].slice(-12), activeViewId: id });
  }

  function applyView(id: string) {
    const view = views.find((v) => v.id === id);
    if (!view) return;
    setRows(
      buildRows(
        mergeSectionOrder(view.sectionOrder, rows.map((r) => r.key)),
        view.hiddenSections as DashboardSectionKey[],
        { ...committedSpans(rows), ...(view.sectionSpans as Partial<Record<DashboardSectionKey, DashboardSectionSpan>>) }
      )
    );
    setActiveViewId(id);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">{leading}</div>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
            Düzeni düzenle
          </button>
        ) : null}
      </div>
      {editing ? (
        <div
          role="toolbar"
          aria-label="Günlük özet düzen araçları"
          className="sticky top-0 z-30 mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-primary)] bg-[var(--color-surface)] px-3 py-2 shadow-sm"
        >
          <div className="mr-auto min-w-0">
            <p className="text-sm font-semibold text-[var(--color-text)]">Düzenleme modu</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              {isWide
                ? "Tutamaktan sürükleyerek taşıyın, sağ kenardan sürükleyerek genişletin/daraltın. Kaydedene kadar hiçbir şey değişmez."
                : "Dar ekranda yalnız sıralama açıktır; genişlik ayarı geniş ekranda yapılır."}
            </p>
          </div>
          {views.length > 0 ? (
            <select
              aria-label="Kayıtlı görünümü uygula"
              value={activeViewId ?? ""}
              onChange={(e) => e.target.value && applyView(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)]"
            >
              <option value="">Kayıtlı görünüm…</option>
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          ) : null}
          <input
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            maxLength={40}
            placeholder="Görünüm adı"
            aria-label="Yeni görünüm adı"
            className="w-32 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)]"
          />
          <ToolbarButton disabled={pending || !viewName.trim()} onClick={saveAsView}>
            Görünüm olarak kaydet
          </ToolbarButton>
          <ToolbarButton disabled={pending} onClick={resetToDefault}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Varsayılana dön
          </ToolbarButton>
          <ToolbarButton disabled={pending} onClick={cancel}>
            İptal
          </ToolbarButton>
          <button
            type="button"
            disabled={pending || !dirty}
            onClick={() => save()}
            className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
          >
            {pending ? "Kaydediliyor…" : "Kaydet"}
          </button>
          {hiddenRows.length > 0 ? (
            <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-[var(--color-border)] pt-2 text-[11px] text-[var(--color-text-muted)]">
              <span>Gizli bölümler:</span>
              {hiddenRows.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setHidden(r.key, false)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--color-border-strong)] px-2 py-0.5 font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  <Plus className="h-3 w-3" aria-hidden />
                  {DASHBOARD_SECTION_LABELS[r.key]}
                </button>
              ))}
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="w-full text-xs" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* grid-flow-dense + masonry satır izleri: kartlar üstteki boşluğa yerleşir (bkz. dashboardRowSpan). */}
      <div
        ref={gridRef}
        style={masonry ? { gridAutoRows: `${DASHBOARD_ROW_UNIT_PX}px`, rowGap: 0 } : undefined}
        className={`grid items-start gap-2.5 xl:grid-flow-row-dense xl:grid-cols-12 ${dragKey || resizeKey ? "select-none" : ""}`}
      >
        {visibleRows.map((row, i) => {
          const node = sections[row.key];
          if (!editing) {
            return (
              <div key={row.key} className={SPAN_CLASS[row.span]} style={rowStyle(row.key)}>
                <div data-measure-key={row.key}>{node}</div>
              </div>
            );
          }
          const active = dragKey === row.key || resizeKey === row.key;
          return (
            <div
              key={row.key}
              data-dash-key={row.key}
              className={`relative rounded-[var(--radius-md)] outline-dashed outline-1 outline-offset-2 transition-[outline-color,opacity] ${SPAN_CLASS[row.span]} ${
                active ? "z-10 outline-[var(--color-primary)]" : "outline-[var(--color-border-strong)]"
              } ${dragKey === row.key ? "opacity-70" : ""}`}
              style={rowStyle(row.key)}
            >
              <div className="absolute inset-x-0 -top-px z-20 flex items-center gap-1 rounded-t-[var(--radius-md)] bg-[var(--color-surface-muted)]/95 px-1.5 py-1 backdrop-blur-sm">
                <button
                  type="button"
                  aria-label={`${DASHBOARD_SECTION_LABELS[row.key]} — taşımak için sürükleyin; ok tuşlarıyla sıra ve genişlik`}
                  aria-roledescription="sürüklenebilir bölüm"
                  onPointerDown={onHandlePointerDown(row.key)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={onHandleKeyDown(row.key)}
                  className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-semibold text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] active:cursor-grabbing"
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                  <span className="truncate">{DASHBOARD_SECTION_LABELS[row.key]}</span>
                </button>
                {isWide ? (
                  <span className="shrink-0 rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--color-text-muted)]">
                    {row.span}/12
                  </span>
                ) : (
                  <>
                    <IconButton label="Yukarı taşı" disabled={i === 0} onClick={() => moveBy(row.key, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                    </IconButton>
                    <IconButton label="Aşağı taşı" disabled={i === visibleRows.length - 1} onClick={() => moveBy(row.key, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                    </IconButton>
                  </>
                )}
                <IconButton label="Bölümü gizle" onClick={() => setHidden(row.key, true)}>
                  <EyeOff className="h-3.5 w-3.5" aria-hidden />
                </IconButton>
              </div>
              {/* İçerik düzenleme sırasında etkileşimsiz: yanlışlıkla link/buton tetiklenmez. */}
              <div data-measure-key={row.key} className="pointer-events-none pt-7" aria-hidden>
                {node}
              </div>
              {isWide ? (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`${DASHBOARD_SECTION_LABELS[row.key]} genişliği`}
                  aria-valuemin={DASHBOARD_MIN_SPAN}
                  aria-valuemax={DASHBOARD_MAX_SPAN}
                  aria-valuenow={row.span}
                  onPointerDown={onResizePointerDown(row)}
                  className="group absolute -right-1.5 top-0 z-20 flex h-full w-3 cursor-ew-resize touch-none items-center justify-center"
                >
                  <span
                    className={`h-10 w-1 rounded-full transition-colors ${
                      resizeKey === row.key ? "bg-[var(--color-primary)]" : "bg-[var(--color-border-strong)] group-hover:bg-[var(--color-primary)]"
                    }`}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToolbarButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)] transition hover:border-[var(--color-primary)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function IconButton({ label, children, ...props }: { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className="shrink-0 rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function buildRows(
  order: DashboardSectionKey[],
  hidden: DashboardSectionKey[],
  spans: Partial<Record<DashboardSectionKey, DashboardSectionSpan>>
): Row[] {
  const hiddenSet = new Set(hidden);
  const defaults = getDefaultDashboardLayout("SUPER_ADMIN").spans;
  return order.map((key) => ({ key, hidden: hiddenSet.has(key), span: spans[key] ?? defaults[key] }));
}

function committedSpans(rows: Row[]): Partial<Record<DashboardSectionKey, DashboardSectionSpan>> {
  return Object.fromEntries(rows.map((r) => [r.key, r.span]));
}

function sameRows(a: Row[], b: Row[]): boolean {
  return a.length === b.length && a.every((r, i) => r.key === b[i]!.key && r.hidden === b[i]!.hidden && r.span === b[i]!.span);
}
