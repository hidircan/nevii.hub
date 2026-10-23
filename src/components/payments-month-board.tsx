"use client";

/**
 * 2026-10-20 — Ödemeler ay panosu: seçili ayın satırları, durum filtreleri (istemcide; sunucu turu yok), öğrenci
 * çekmecesi. Satır = bir ödeme satırının o aya düşen payı (bkz. payment-month-view.ts). Durum/etiket/renk tek
 * sözlükten (payments/status.ts). Bu pano TAKİP ve GÖRÜNÜM içindir — tahsilat alınmaz; tahsilatlar YOKLAMA
 * TAKVİMİ üzerinden yapılır. Mevcut kaydın düzeltilmesi `PaymentMarkPaidModal` (edit) ile yapılır.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "@/components/link";
import { Receipt, Search, X } from "lucide-react";
import { cn, formatDate, formatDateTime, formatMoney, paymentMethodLabelTr } from "@/lib/utils";
import { withReturnTo } from "@/lib/safe-return-to";
import { useCurrentPath } from "@/lib/use-current-path";
import { PAYMENT_STATUS_INFO, type PaymentDisplayStatus } from "@/lib/payments/status";
import type { MonthPaymentRow } from "@/lib/payment-month-view";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { PaymentMarkPaidModal } from "@/components/payment-mark-paid-modal";
import { PaymentDeleteDialog } from "@/components/payment-delete-dialog";
import { PaginationControls, usePagination } from "@/components/pagination-controls";

type Filter = "all" | "carryover" | Exclude<PaymentDisplayStatus, "voided" | "closed">;
const FILTERS: Exclude<Filter, "all" | "carryover">[] = ["overdue", "upcoming", "pending", "partial", "paid"];

/** Yalnız mevcut kaydın düzeltilmesi (edit) — yeni tahsilat bu panodan açılmaz. */
type Modal = { row: MonthPaymentRow } | null;

function isPaymentMethod(value: string | undefined): value is "credit_card" | "cash" | "transfer" {
  return value === "credit_card" || value === "cash" || value === "transfer";
}

export function PaymentsMonthBoard({
  monthLabel,
  rows,
  carryover,
  paidInstallmentCounts,
  canWrite,
  canDelete,
  empty,
  highlightPaymentId,
}: {
  /** Boş durum metni (öğrenci detayı: "Açık borç yok"); verilmezse ay metni. */
  empty?: { title: string; hint: string };
  monthLabel: string;
  rows: MonthPaymentRow[];
  carryover: MonthPaymentRow[];
  /** Öğrencinin tüm ödemelerinden türetilen ödenmiş taksit sayısı. Ay satırlarından sayılmaz. */
  paidInstallmentCounts?: Record<string, number>;
  canWrite: boolean;
  canDelete: boolean;
  /** Bildirimden gelen derin bağlantı (`?odeme=`): ilgili satır vurgulanır. */
  highlightPaymentId?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [drawerStudentId, setDrawerStudentId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Partial<Record<Filter, number>> = { all: rows.length, carryover: carryover.length };
    for (const r of rows) c[r.status as Filter] = (c[r.status as Filter] ?? 0) + 1;
    return c;
  }, [rows, carryover]);

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    const base = filter === "carryover" ? carryover : filter === "all" ? rows : rows.filter((r) => r.status === filter);
    return q ? base.filter((r) => r.studentName.toLocaleLowerCase("tr").includes(q)) : base;
  }, [rows, carryover, filter, search]);

  const { pageItems, page, setPage, pageSize, setPageSize, totalPages, totalCount } = usePagination(visible, 25);

  const drawerRows = useMemo(
    () => (drawerStudentId ? [...rows, ...carryover].filter((r) => r.studentId === drawerStudentId) : []),
    [drawerStudentId, rows, carryover]
  );

  const actions = { canWrite, canDelete, onModal: setModal };

  return (
    <>
      <p className="mb-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
        Bu ekran tahsilat almaz — ödemeler{" "}
        <Link href="/panel/yoklama" className="font-medium text-[var(--color-primary)] hover:underline">
          Yoklama Takvimi
        </Link>{" "}
        üzerinden tahsil edilir. Burada takip, filtreleme ve kayıt düzeltme yapılır.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Durum filtresi">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="Tümü" count={counts.all ?? 0} />
        {FILTERS.map((f) => (
          <FilterChip
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
            label={f === "pending" ? "Bekleyen" : PAYMENT_STATUS_INFO[f].label}
            title={PAYMENT_STATUS_INFO[f].description}
            count={counts[f] ?? 0}
          />
        ))}
        {carryover.length > 0 ? (
          <FilterChip
            active={filter === "carryover"}
            onClick={() => setFilter("carryover")}
            label="Önceki aylardan gecikmiş"
            title={`${monthLabel} öncesine ait, vadesi geçmiş ve hâlâ kalanı olan satırlar.`}
            count={carryover.length}
            danger
          />
        ) : null}
        <label className="relative ml-auto w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Öğrenci ara"
            aria-label="Öğrenci adına göre ara"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-8 pr-2 text-sm"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_5rem_5.5rem_5.5rem_5.5rem_6.75rem_6.25rem_6.5rem_minmax(8rem,auto)] gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] md:grid">
          <span>Öğrenci · bağlam</span>
          <span>Vade</span>
          <span className="text-right">Beklenen</span>
          <span className="text-right">Alınan</span>
          <span className="text-right">Kalan</span>
          <span>Ödemenin alındığı tarih</span>
          <span>Ödeme türü</span>
          <span>Durum</span>
          <span className="text-right">İşlem</span>
        </div>
        {rows.length === 0 && filter !== "carryover" ? (
          <EmptyBlock
            title={empty?.title ?? `${monthLabel} için beklenen ödeme yok`}
            hint={
              empty?.hint ??
              "Bu aya düşen sözleşme taksiti veya aylık plan kaydı bulunmuyor. Önceki veya sonraki aya geçebilirsiniz."
            }
          />
        ) : visible.length === 0 ? (
          <EmptyBlock
            title="Bu filtrede satır yok"
            hint="Filtreyi veya aramayı değiştirin."
            action={
              <button type="button" onClick={() => { setFilter("all"); setSearch(""); }} className="text-sm font-medium text-[var(--color-primary)] hover:underline">
                Filtreleri temizle
              </button>
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {pageItems.map((r) => (
              <li key={`${r.id}-${r.month}`} id={`odeme-${r.id}`} className={r.id === highlightPaymentId ? "scroll-mt-24 bg-[var(--color-surface-muted)]" : "scroll-mt-24"}>
                <PaymentLine row={r} showMonth={filter === "carryover"} highlighted={r.id === highlightPaymentId} onOpenStudent={() => setDrawerStudentId(r.studentId)} {...actions} />
              </li>
            ))}
          </ul>
        )}
        {visible.length > 0 ? (
          <PaginationControls
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        ) : null}
      </div>

      {drawerStudentId ? (
        <StudentDrawer
          studentId={drawerStudentId}
          monthLabel={monthLabel}
          rows={drawerRows}
          paidInstallmentCount={paidInstallmentCounts?.[drawerStudentId]}
          onClose={() => setDrawerStudentId(null)}
          {...actions}
        />
      ) : null}

      {modal ? (
        <PaymentMarkPaidModal
          paymentId={modal.row.id}
          studentName={modal.row.studentName}
          defaultAmount={modal.row.rowPaidAmount || modal.row.rowAmount}
          initialMethod={isPaymentMethod(modal.row.method) ? modal.row.method : undefined}
          initialNote={modal.row.paymentNote}
          initialPaidAt={modal.row.paidAt}
          dueDate={modal.row.dueDate}
          description={modal.row.description}
          source={modal.row.source}
          lessonId={modal.row.lessonId}
          onClose={() => setModal(null)}
        />
      ) : null}
    </>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  title,
  danger,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-text-inverted)]"
          : danger
            ? "border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:border-[var(--color-danger)]"
            : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      )}
    >
      {label}
      <span className={cn("tabular-nums", active ? "opacity-90" : "opacity-70")}>{count}</span>
    </button>
  );
}

function EmptyBlock({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-[var(--color-text-muted)]">{hint}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

type LineActions = {
  canWrite: boolean;
  canDelete: boolean;
  onModal: (m: Modal) => void;
};

function Money({ value, tone, strong }: { value: number; tone?: "danger" | "success" | "muted"; strong?: boolean }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        strong && "font-semibold",
        tone === "danger" && "text-[var(--color-danger)]",
        tone === "success" && "text-[var(--color-success)]",
        tone === "muted" && "text-[var(--color-text-muted)]"
      )}
    >
      {formatMoney(value)}
    </span>
  );
}

function RowActions({ row, canWrite, canDelete, onModal, withDelete }: LineActions & { row: MonthPaymentRow; withDelete?: boolean }) {
  const currentPath = useCurrentPath();
  const btn = "rounded-md px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {row.rowPaidAmount > 0 && canWrite ? (
        <button
          type="button"
          onClick={() => onModal({ row })}
          title="Mevcut tahsilatı düzenler; yeni tahsilat açmaz."
          className={cn(btn, "border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]")}
        >
          Düzelt
        </button>
      ) : null}
      {row.status === "paid" ? (
        <Link
          href={withReturnTo(`/makbuz/${row.id}`, currentPath)}
          aria-label="Makbuz"
          title="Makbuz"
          className="rounded-md border border-[var(--color-border)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
        >
          <Receipt className="h-3.5 w-3.5" />
        </Link>
      ) : null}
      {withDelete && canDelete ? <PaymentDeleteDialog paymentId={row.id} /> : null}
    </div>
  );
}

function RowContext({ row, showMonth }: { row: MonthPaymentRow; showMonth?: boolean }) {
  // Ödemenin alındığı tarih + ödeme türü artık kendi sütunlarında (masaüstü) ve mobil bilgi
  // satırında gösteriliyor — burada tekrarlanmaz (duplicated rendering temizliği).
  const bits = [
    showMonth ? row.month : null,
    row.description,
    row.spansMonths ? "çok aylı tahsilatın bu aya düşen payı" : null,
    row.coveredInstallments > 1 ? `${row.coveredInstallments} taksit karşılandı` : null,
  ].filter(Boolean);
  return <p className="truncate text-xs text-[var(--color-text-muted)]" title={bits.join(" · ")}>{bits.join(" · ")}</p>;
}

function PaymentLine({
  row,
  showMonth,
  highlighted,
  onOpenStudent,
  ...actions
}: LineActions & { row: MonthPaymentRow; showMonth: boolean; highlighted?: boolean; onOpenStudent: () => void }) {
  const remainingTone = row.status === "overdue" ? "danger" : row.remaining === 0 ? "muted" : undefined;
  const gridCols = "md:grid-cols-[minmax(0,1.6fr)_5rem_5.5rem_5.5rem_5.5rem_6.75rem_6.25rem_6.5rem_minmax(8rem,auto)]";
  return (
    <div className={highlighted ? `grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-2.5 ring-2 ring-inset ring-[var(--color-primary)] ${gridCols} md:items-center md:gap-3` : `grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-2.5 ${gridCols} md:items-center md:gap-3`}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenStudent}
            className="truncate text-sm font-semibold text-[var(--color-text)] hover:text-[var(--color-primary)] hover:underline"
          >
            {row.studentName || "Öğrenci bulunamadı"}
          </button>
          {row.branchLabel ? (
            <span className="shrink-0 rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-text)]">{row.branchLabel}</span>
          ) : null}
        </div>
        <RowContext row={row} showMonth={showMonth} />
      </div>
      {/* Mobil: rozet sağ üstte; masaüstünde kendi sütununda. */}
      <div className="justify-self-end md:hidden">
        <PaymentStatusBadge status={row.status} />
      </div>
      <span className="text-xs text-[var(--color-text-muted)] md:text-sm md:text-[var(--color-text)]">
        <span className="md:hidden">Vade </span>
        {formatDate(row.dueDate)}
      </span>
      <div className="col-span-2 grid grid-cols-3 gap-2 text-xs md:contents md:text-sm">
        <span className="md:text-right"><span className="block text-[10px] text-[var(--color-text-muted)] md:hidden">Beklenen</span><Money value={row.expected} /></span>
        <span className="md:text-right"><span className="block text-[10px] text-[var(--color-text-muted)] md:hidden">Alınan</span><Money value={row.collected} tone={row.collected > 0 ? "success" : "muted"} /></span>
        <span className="md:text-right"><span className="block text-[10px] text-[var(--color-text-muted)] md:hidden">Kalan</span><Money value={row.remaining} tone={remainingTone} strong /></span>
      </div>
      {/* Mobil bilgi satırı: masaüstündeki iki yeni sütunun karşılığı. */}
      <div className="col-span-2 text-xs text-[var(--color-text-muted)] md:hidden">
        Ödemenin alındığı tarih:{" "}
        {row.paidAt ? (
          <span className="font-medium text-[var(--color-text)]" title={formatDateTime(row.paidAt)}>{formatDate(row.paidAt)}</span>
        ) : (
          <span>—</span>
        )}
        {" · "}Ödeme türü: <span className="font-medium text-[var(--color-text)]">{paymentMethodLabelTr(row.method)}</span>
      </div>
      <span className="hidden text-sm text-[var(--color-text)] md:block" title={row.paidAt ? formatDateTime(row.paidAt) : undefined}>
        {row.paidAt ? formatDate(row.paidAt) : <span className="text-[var(--color-text-muted)]">—</span>}
      </span>
      <span className="hidden text-sm text-[var(--color-text)] md:block">
        {paymentMethodLabelTr(row.method)}
      </span>
      <div className="hidden md:block">
        <PaymentStatusBadge status={row.status} />
      </div>
      <div className="col-span-2 md:col-span-1">
        <RowActions row={row} {...actions} />
      </div>
    </div>
  );
}

function StudentDrawer({
  studentId,
  monthLabel,
  rows,
  paidInstallmentCount,
  onClose,
  ...actions
}: LineActions & { studentId: string; monthLabel: string; rows: MonthPaymentRow[]; paidInstallmentCount?: number; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const name = rows[0]?.studentName ?? "Öğrenci";
  const expected = rows.reduce((s, r) => s + r.expected, 0);
  const collected = rows.reduce((s, r) => s + r.collected, 0);
  const remaining = rows.reduce((s, r) => s + r.remaining, 0);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-label={`${name} ödemeleri`} className="flex h-full w-full max-w-md flex-col bg-[var(--color-surface)] shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-[var(--color-text)]">{name}</p>
            <p className="text-xs text-[var(--color-text-muted)]">{monthLabel} ve önceki aylardan kalan gecikmişler</p>
            {paidInstallmentCount !== undefined ? (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Ödenmiş taksit sayısı: <strong className="tabular-nums text-[var(--color-text)]">{paidInstallmentCount}</strong>
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]">
            <X className="h-4 w-4" />
          </button>
        </header>
        <dl className="grid grid-cols-3 gap-2 border-b border-[var(--color-border)] px-4 py-3 text-xs">
          <div><dt className="text-[var(--color-text-muted)]">Beklenen</dt><dd className="text-sm font-semibold"><Money value={expected} /></dd></div>
          <div><dt className="text-[var(--color-text-muted)]">Alınan</dt><dd className="text-sm font-semibold"><Money value={collected} tone="success" /></dd></div>
          <div><dt className="text-[var(--color-text-muted)]">Kalan</dt><dd className="text-sm font-semibold"><Money value={remaining} tone={remaining > 0 ? "danger" : "muted"} /></dd></div>
        </dl>
        <ul className="flex-1 divide-y divide-[var(--color-border)] overflow-y-auto">
          {rows.map((r) => (
            <li key={`${r.id}-${r.month}`} className="space-y-1.5 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--color-text-muted)]">{r.month} · vade {formatDate(r.dueDate)}</span>
                <PaymentStatusBadge status={r.status} />
              </div>
              <RowContext row={r} />
              <p className="text-xs text-[var(--color-text-muted)]">
                Ödemenin alındığı tarih:{" "}
                {r.paidAt ? (
                  <span className="font-medium text-[var(--color-text)]" title={formatDateTime(r.paidAt)}>{formatDate(r.paidAt)}</span>
                ) : (
                  <span>—</span>
                )}
                {" · "}Ödeme türü: <span className="font-medium text-[var(--color-text)]">{paymentMethodLabelTr(r.method)}</span>
              </p>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-xs text-[var(--color-text-muted)]">
                  <Money value={r.collected} tone="success" /> / <Money value={r.expected} /> · kalan <Money value={r.remaining} strong tone={r.remaining > 0 ? "danger" : "muted"} />
                </span>
              </div>
              <RowActions row={r} withDelete {...actions} />
            </li>
          ))}
        </ul>
        <footer className="border-t border-[var(--color-border)] px-4 py-3">
          <Link
            href={`/panel/odemeler/${studentId}`}
            className="block rounded-lg border border-[var(--color-border)] px-3 py-2 text-center text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
          >
            Öğrencinin tüm ödemeleri ve geçmişi →
          </Link>
        </footer>
      </aside>
    </div>
  );
}
