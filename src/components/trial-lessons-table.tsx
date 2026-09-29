"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Pencil, RotateCcw, Search } from "lucide-react";
import { ModalShell, modalButton } from "@/components/modal-shell";
import { CriticalDeleteDialog } from "@/components/critical-delete-dialog";
import { PaginationControls, usePagination } from "@/components/pagination-controls";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";
import { apiFetchJson } from "@/lib/api/client-fetch";
import {
  TRIAL_CONVERSION_PROMPT_STATUSES,
  TRIAL_STATUS_LABELS,
  trialStatusLabel,
  trialConversionHref,
} from "@/lib/trial-lesson-labels";
import {
  DEFAULT_TRIAL_LIST_FILTER,
  countTrialViews,
  filterTrialRows,
  isOpenTrial,
  type TrialListFilter,
  type TrialListRow,
  type TrialListView,
} from "@/lib/trial-list-filter";
import { wallDateTimeInputToIso } from "@/lib/timezone";
import type { TrialLessonStatus } from "@/lib/types";

export type TrialRow = TrialListRow & {
  startLabel: string;
  /** datetime-local değeri (kurum saatine göre) — düzenleme formu için. */
  startLocal: string;
  durationMinutes: number;
  createdByName: string;
  convertedStudentName?: string;
  convertedByName?: string;
  convertedAtLabel?: string;
  /** Ders başladı mı — sonuç notu yalnız başladıktan sonra. */
  isStarted: boolean;
  resultNotesLabel?: string;
};

const VIEW_LABELS: Record<TrialListView, string> = {
  all: "Tümü",
  upcoming: "Yaklaşan",
  past: "Geçmiş",
  open: "Dönüşmeyen",
};


const control =
  "rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]";

/**
 * Deneme dersleri listesi — arama, görünüm/durum/şube/öğretmen/tarih filtreleri,
 * sıralama ve sayfalama. Satırdan düzenleme (plan, hazırlık notu, sonuç notu).
 * Statü "Katıldı / Kayıt bekleniyor"a geçince dönüşüm sorulur.
 */
export function TrialLessonsTable({
  rows,
  canWrite,
  canConvertTrial = true,
  canDelete = false,
  isTeacher,
  teachers,
  branches,
  instrumentOptions,
  initialPromptTrialId,
  initialOpenTrialId,
}: {
  rows: TrialRow[];
  canWrite: boolean;
  /** Şube müdürü revize eder ama kayda dönüştürmez (öğrenci kaydı ayrı yetki). */
  canConvertTrial?: boolean;
  /** Kalıcı silme yalnız kurum sahibi/yöneticisi + kritik şifre (2026-09-29 owner kuralı). */
  canDelete?: boolean;
  /** Öğretmen başka öğretmene devredemez — öğretmen seçici kilitli. */
  isTeacher: boolean;
  teachers: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  /** Kurum enstrüman kataloğu (aktif) — yeni öğrenci formuyla aynı kaynak. */
  instrumentOptions: string[];
  /** Az önce planlanan deneme — sayfa açılışında dönüşüm sorusu sorulur. */
  initialPromptTrialId?: string;
  /** Günlük Özet'ten gelen `?deneme=` — o deneme doğrudan açılır. */
  initialOpenTrialId?: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<TrialListFilter>(DEFAULT_TRIAL_LIST_FILTER);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptId, setPromptId] = useState<string | null>(
    initialPromptTrialId && rows.some((r) => r.id === initialPromptTrialId && !r.convertedStudentId) ? initialPromptTrialId : null
  );
  const [editId, setEditId] = useState<string | null>(
    initialOpenTrialId && rows.some((r) => r.id === initialOpenTrialId) ? initialOpenTrialId : null
  );

  const counts = countTrialViews(rows);
  const filtered = filterTrialRows(rows, filter);
  const { pageItems, page, setPage, pageSize, setPageSize, totalPages, totalCount } = usePagination(filtered, 20);

  /** Filtre değişince ilk sayfaya dön — boş sayfada kalınmaz. */
  function patchFilter(p: Partial<TrialListFilter>) {
    setFilter((f) => ({ ...f, ...p }));
    setPage(1);
  }
  const filtersActive = JSON.stringify(filter) !== JSON.stringify(DEFAULT_TRIAL_LIST_FILTER);

  const prompt = rows.find((r) => r.id === promptId);
  const editing = rows.find((r) => r.id === editId);

  async function changeStatus(row: TrialRow, status: TrialLessonStatus) {
    setBusyId(row.id);
    setError(null);
    const res = await apiFetchJson(`/api/v1/trials/${row.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(friendlyApiErrorMessage(res.error, "Deneme durumu güncellenemedi. Sayfayı yenileyip tekrar deneyin."));
      return;
    }
    if (!row.convertedStudentId && TRIAL_CONVERSION_PROMPT_STATUSES.includes(status)) setPromptId(row.id);
    router.refresh();
  }

  function statusCell(r: TrialRow) {
    return canWrite && !r.convertedStudentId ? (
      <select
        aria-label={`${r.name} deneme durumu`}
        value={r.status}
        disabled={busyId === r.id}
        onChange={(e) => void changeStatus(r, e.target.value as TrialLessonStatus)}
        className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
      >
        {(Object.keys(TRIAL_STATUS_LABELS) as TrialLessonStatus[]).map((s) => (
          <option key={s} value={s}>
            {TRIAL_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    ) : (
      <span className="text-xs font-medium text-[var(--color-text)]">{trialStatusLabel(r)}</span>
    );
  }

  function conversionCell(r: TrialRow) {
    if (r.convertedStudentId) {
      return (
        <div className="text-xs">
          <Link href={`/panel/ogrenciler/${r.convertedStudentId}`} className="font-semibold text-[var(--color-success)] hover:underline">
            Kayda dönüştü → {r.convertedStudentName ?? "Öğrenci"}
          </Link>
          <span className="block text-[var(--color-text-muted)]">
            {r.convertedByName ?? "Bilinmeyen kullanıcı"}
            {r.convertedAtLabel ? ` · ${r.convertedAtLabel}` : ""}
          </span>
        </div>
      );
    }
    // Şube müdürü revize eder ama KAYDA DÖNÜŞTÜRMEZ (öğrenci kaydı ayrı yetki).
    if (canWrite && canConvertTrial && isOpenTrial(r)) {
      return (
        <Link
          href={trialConversionHref(r.id)}
          className="inline-flex rounded-md border border-[var(--color-trial)] px-2 py-1 text-xs font-semibold text-[var(--color-trial)] hover:bg-[var(--color-trial-soft)]"
        >
          Kayda dönüştür
        </Link>
      );
    }
    return <span className="text-xs text-[var(--color-text-muted)]">—</span>;
  }

  function notesCell(r: TrialRow) {
    const awaitingResult = r.isPast && r.status !== "cancelled" && !r.resultNotes;
    return (
      <div className="max-w-[16rem] space-y-0.5 text-xs">
        {r.notes ? (
          <p className="line-clamp-2 text-[var(--color-text)]" title={r.notes}>
            <span className="font-semibold">Hazırlık:</span> {r.notes}
          </p>
        ) : null}
        {r.resultNotes ? (
          <p className="line-clamp-2 text-[var(--color-text)]" title={r.resultNotes}>
            <span className="font-semibold">Sonuç:</span> {r.resultNotes}
          </p>
        ) : null}
        {awaitingResult ? (
          <p className="font-medium" style={{ color: "var(--color-warning)" }}>
            Sonuç notu bekliyor
          </p>
        ) : null}
        {!r.notes && !r.resultNotes && !awaitingResult ? <span className="text-[var(--color-text-muted)]">—</span> : null}
      </div>
    );
  }

  /**
   * Sahip emri (2026-09-28): satır HER ZAMAN düzenlenebilir (geçmiş/kayıtlı/
   * iptal ayrımı yok — ad düzeltmesi dahil tüm sütunlar), arşivlenebilir
   * (statü: iptal) ve silinebilir (kalıcı, denetim izli). Arşiv/silme iki
   * tıkla onaylanır; sessiz tek-tık işlem yok.
   */
  function rowActions(r: TrialRow) {
    if (!canWrite) return null;
    return (
      <RowActions
        row={r}
        busy={busyId === r.id}
        onEdit={() => setEditId(r.id)}
        onArchive={() => void changeStatus(r, r.status === "cancelled" ? "planned" : "cancelled")}
        onDelete={canDelete ? (input) => deleteTrial(r, input) : undefined}
      />
    );
  }

  async function deleteTrial(
    row: TrialRow,
    input: { criticalPassword: string; reason: string }
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    setError(null);
    const res = await apiFetchJson(`/api/v1/trials/${row.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      return { ok: false, message: friendlyApiErrorMessage(res.error, "Deneme dersi silinemedi. Sayfayı yenileyip tekrar deneyin.") };
    }
    router.refresh();
    return { ok: true };
  }

  return (
    <div>
      <div role="tablist" aria-label="Deneme dersi görünümü" className="mb-2 flex flex-wrap gap-1.5">
        {(Object.keys(VIEW_LABELS) as TrialListView[]).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={filter.view === key}
            onClick={() => patchFilter({ view: key })}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              filter.view === key
                ? "border-[var(--color-trial)] bg-[var(--color-trial-soft)] text-[var(--color-text)]"
                : "border-[var(--color-border-strong)] text-[var(--color-text-muted)] hover:border-[var(--color-trial)]"
            }`}
          >
            {VIEW_LABELS[key]} <span className="opacity-70">{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative sm:col-span-2">
          <span className="sr-only">Ara</span>
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-[var(--color-text-muted)]" aria-hidden />
          <input
            value={filter.query}
            onChange={(e) => patchFilter({ query: e.target.value })}
            placeholder="Aday, telefon, öğretmen, not…"
            className={`${control} w-full pl-8`}
          />
        </label>
        <select
          aria-label="Durum"
          value={filter.status}
          onChange={(e) => patchFilter({ status: e.target.value as TrialListFilter["status"] })}
          className={control}
        >
          <option value="all">Tüm durumlar</option>
          {(Object.keys(TRIAL_STATUS_LABELS) as TrialLessonStatus[]).map((s) => (
            <option key={s} value={s}>
              {TRIAL_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Sıralama"
          value={filter.sort}
          onChange={(e) => patchFilter({ sort: e.target.value as TrialListFilter["sort"] })}
          className={control}
        >
          <option value="date_desc">Tarih: yeniden eskiye</option>
          <option value="date_asc">Tarih: eskiden yeniye</option>
          <option value="name">Ada göre</option>
        </select>
        {branches.length > 1 ? (
          <select aria-label="Şube" value={filter.branchId} onChange={(e) => patchFilter({ branchId: e.target.value })} className={control}>
            <option value="all">Tüm şubeler</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        ) : null}
        {!isTeacher ? (
          <select aria-label="Öğretmen" value={filter.teacherId} onChange={(e) => patchFilter({ teacherId: e.target.value })} className={control}>
            <option value="all">Tüm öğretmenler</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : null}
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <span className="shrink-0">Başlangıç</span>
          <input type="date" value={filter.from} onChange={(e) => patchFilter({ from: e.target.value })} className={`${control} min-w-0 flex-1`} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <span className="shrink-0">Bitiş</span>
          <input type="date" value={filter.to} onChange={(e) => patchFilter({ to: e.target.value })} className={`${control} min-w-0 flex-1`} />
        </label>
      </div>
      {filtersActive ? (
        <button
          type="button"
          onClick={() => patchFilter(DEFAULT_TRIAL_LIST_FILTER)}
          className="mb-2 text-xs font-medium text-[var(--color-primary)] hover:underline"
        >
          Filtreleri temizle
        </button>
      ) : null}

      {error ? (
        <p role="alert" className="mb-2 text-xs font-medium" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {pageItems.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">
            {rows.length === 0 ? "Henüz deneme dersi yok." : "Bu filtrelere uyan deneme dersi yok."}
          </p>
        ) : (
          <>
            {/* Mobil: kart listesi */}
            <ul className="divide-y divide-[var(--color-border)] md:hidden">
              {pageItems.map((r) => (
                <li key={r.id} className="space-y-2 px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--color-text)]">{r.name}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {r.startLabel} · {r.durationMinutes} dk · {r.instrument} · {r.teacherName} · {r.branchName}
                      </p>
                    </div>
                    {rowActions(r)}
                  </div>
                  {notesCell(r)}
                  <div className="flex flex-wrap items-center gap-2">
                    {statusCell(r)}
                    {conversionCell(r)}
                  </div>
                </li>
              ))}
            </ul>
            {/* Geniş ekran: tablo */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Aday</th>
                    <th className="px-3 py-2">Tarih</th>
                    <th className="px-3 py-2">Enstrüman · Öğretmen</th>
                    <th className="px-3 py-2">Şube</th>
                    <th className="px-3 py-2">Notlar</th>
                    <th className="px-3 py-2">Durum</th>
                    <th className="px-3 py-2">Kayıt</th>
                    <th className="px-3 py-2">
                      <span className="sr-only">İşlem</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--color-border)] align-top last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium text-[var(--color-text)]">{r.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {r.phone}
                          {r.parentName ? ` · Veli: ${r.parentName}` : ""}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-muted)]">Planlayan: {r.createdByName}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="text-[var(--color-text)]">{r.startLabel}</span>
                        <span className="block text-xs text-[var(--color-text-muted)]">{r.durationMinutes} dk</span>
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text)]">
                        {r.instrument}
                        <span className="block text-xs text-[var(--color-text-muted)]">{r.teacherName}</span>
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text-muted)]">{r.branchName}</td>
                      <td className="px-3 py-2">{notesCell(r)}</td>
                      <td className="px-3 py-2">{statusCell(r)}</td>
                      <td className="px-3 py-2">{conversionCell(r)}</td>
                      <td className="px-3 py-2">{rowActions(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <PaginationControls
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {editing ? (
        <TrialEditModal
          key={editing.id}
          row={editing}
          isTeacher={isTeacher}
          teachers={teachers}
          branches={branches}
          instrumentOptions={instrumentOptions}
          onClose={() => setEditId(null)}
          onSaved={() => {
            setEditId(null);
            router.refresh();
          }}
        />
      ) : null}

      <ModalShell
        open={!!prompt}
        title="Bu deneme öğrencisi kayda dönüştürülsün mü?"
        onClose={() => setPromptId(null)}
        footer={
          <>
            <button type="button" className={modalButton.secondary} onClick={() => setPromptId(null)}>
              Daha sonra
            </button>
            {prompt ? (
              <Link href={trialConversionHref(prompt.id)} className={modalButton.primary}>
                Evet, kayıt formunu aç
              </Link>
            ) : null}
          </>
        }
      >
        {prompt ? (
          <>
            <p>
              <strong>{prompt.name}</strong> ({prompt.instrument}, {prompt.teacherName}) için yeni öğrenci kaydı formu deneme
              bilgileriyle doldurularak açılır. Kaydı siz tamamladığınızda deneme &quot;kayda dönüştü&quot; olarak işaretlenir ve
              dönüşümü yapan personel olarak kaydedilirsiniz.
            </p>
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Şimdi vazgeçerseniz deneme listede &quot;Dönüşmeyen&quot; olarak kalır; istediğiniz zaman &quot;Kayda dönüştür&quot; ile
              devam edebilirsiniz.
            </p>
          </>
        ) : null}
      </ModalShell>
    </div>
  );
}

/**
 * Satır eylemleri: Düzenle (her zaman) + Arşivle/Geri aç (iki tık onay) +
 * Sil (iki tık onay, kalıcı). Kurşun geçirmez kural: sessiz tek-tıkla
 * arşiv/silme yok.
 */
function RowActions({
  row,
  busy,
  onEdit,
  onArchive,
  onDelete,
}: {
  row: TrialRow;
  busy: boolean;
  onEdit: () => void;
  onArchive: () => void;
  /** Yoksa Sil gösterilmez (yetkisiz rol). */
  onDelete?: (input: { criticalPassword: string; reason: string }) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const [arm, setArm] = useState<"archive" | null>(null);
  const archived = row.status === "cancelled";
  if (arm) {
    return (
      <span className="inline-flex shrink-0 flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[var(--color-text-muted)]">{archived ? "Geri açılsın mı?" : "Arşivlensin mi?"}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setArm(null);
            onArchive();
          }}
          className="font-semibold text-[var(--color-danger)] hover:underline disabled:opacity-50"
        >
          {busy ? "…" : "Evet"}
        </button>
        <button
          type="button"
          onClick={() => setArm(null)}
          className="font-medium text-[var(--color-text-muted)] hover:underline"
        >
          Vazgeç
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${row.name} deneme dersini düzenle`}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] px-2 py-1 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]"
      >
        <Pencil className="h-3 w-3" aria-hidden />
        Düzenle
      </button>
      <button
        type="button"
        onClick={() => setArm("archive")}
        aria-label={`${row.name} deneme dersini ${archived ? "geri aç" : "arşivle"}`}
        title={archived ? "İptal durumunu geri al (planlandı)" : "Arşivle (iptal olarak işaretle, silinmez)"}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:border-[var(--color-primary)]"
      >
        {archived ? <RotateCcw className="h-3 w-3" aria-hidden /> : <Archive className="h-3 w-3" aria-hidden />}
        {archived ? "Geri aç" : "Arşivle"}
      </button>
      {onDelete ? (
        <CriticalDeleteDialog
          triggerLabel="Sil"
          title={`${row.name} deneme dersini sil`}
          meaning="Deneme kaydı kalıcı olarak silinir (geri alınamaz). Dökümü, silen kişi ve gerekçe denetim kaydında kalır. Yalnız gizlemek istiyorsanız Arşivle'yi kullanın."
          confirmationName={row.name}
          confirmationLabel="Onay için adı aynen yazın"
          submitLabel="Kalıcı sil"
          loadImpact={async () => ({
            ok: true,
            data: {
              lines: [
                ["Deneme", row.name],
                ["Durum", trialStatusLabel(row)],
                ["Geri alma", "Yok — arşivleme geri alınabilir"],
              ],
              allowed: true,
              criticalPasswordConfigured: true,
            },
          })}
          onSubmit={async ({ criticalPassword, reason, confirmation }) => {
            if (confirmation.trim().toLocaleLowerCase("tr") !== row.name.trim().toLocaleLowerCase("tr")) {
              return { ok: false, message: `Onay için adı aynen yazın: "${row.name}".` };
            }
            return onDelete({ criticalPassword, reason });
          }}
        />
      ) : null}
    </span>
  );
}

/** Düzenleme penceresi — tüm alanlar her zaman düzenlenebilir (sahip emri 2026-09-28). */
function TrialEditModal({
  row,
  isTeacher,
  teachers,
  branches,
  instrumentOptions,
  onClose,
  onSaved,
}: {
  row: TrialRow;
  isTeacher: boolean;
  teachers: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  instrumentOptions: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [phone, setPhone] = useState(row.phone);
  const [parentName, setParentName] = useState(row.parentName ?? "");
  const [instrument, setInstrument] = useState(row.instrument);
  const [branchId, setBranchId] = useState(row.branchId);
  const [teacherId, setTeacherId] = useState(row.teacherId);
  const [startLocal, setStartLocal] = useState(row.startLocal);
  const [duration, setDuration] = useState(String(row.durationMinutes));
  const [notes, setNotes] = useState(row.notes ?? "");
  const [resultNotes, setResultNotes] = useState(row.resultNotes ?? "");
  const [override, setOverride] = useState(false);
  const [needsOverride, setNeedsOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const teacherOptions = teachers.some((t) => t.id === row.teacherId)
    ? teachers
    : [{ id: row.teacherId, name: `${row.teacherName} (pasif)` }, ...teachers];
  // 11. tur iş #1 — 2026-09-01 öncesi 30/45/60 dk denemeler tarihsel kayıttır:
  // mevcut süre seçeneklerde YOKSA select boş kalır ve her kayıt reddedilirdi.
  // Mevcut değer "(mevcut kayıt)" olarak korunur; YENİ seçim yalnız 10/15/20 olabilir.
  const durationOptions = [10, 15, 20].includes(row.durationMinutes)
    ? [10, 15, 20]
    : [row.durationMinutes, 10, 15, 20];

  async function save() {
    // Sahip emri (2026-09-28): tüm sütunlar HER ZAMAN düzenlenebilir —
    // geçmiş/kayıtlı/iptal ayrımı yok (sunucu da kilidi kaldırdı, her
    // değişiklik alan-düzeyi diff ile denetime yazılır).
    const startIso = wallDateTimeInputToIso(startLocal);
    if (!startIso) {
      setError("Geçerli bir tarih ve saat seçin.");
      return;
    }
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      name: name.trim(),
      phone: phone.trim(),
      parentName: parentName.trim(),
      instrument,
      branchId,
      teacherId,
      startAt: startIso,
      durationMinutes: Number(duration),
      notes,
      resultNotes,
      allowAvailabilityOverride: override || undefined,
    };
    const res = await apiFetchJson(`/api/v1/trials/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      if (res.error?.code === "CONFLICT") setNeedsOverride(true);
      setError(friendlyApiErrorMessage(res.error, "Deneme dersi kaydedilemedi. Bilgileri kontrol edip tekrar deneyin."));
      return;
    }
    onSaved();
  }

  const field = `w-full ${control}`;
  const label = "text-xs font-medium text-[var(--color-text-muted)]";
  return (
    <ModalShell
      open
      size="lg"
      busy={busy}
      title={`${row.name} — deneme dersi`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={modalButton.secondary} onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            type="button"
            className={modalButton.primary}
            onClick={() => void save()}
            disabled={busy || (needsOverride && !override)}
          >
            {busy ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {row.convertedStudentId ? (
          <p className="rounded-md bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
            Bu deneme kayda dönüştürülmüş — kimlik/plan düzeltmesi öğrencinin mevcut kaydını değiştirmez, yalnız bu
            deneme satırını günceller.
          </p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className={label}>Ad</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className={label}>Telefon</span>
            <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className={label}>Veli adı (opsiyonel)</span>
            <input className={field} value={parentName} onChange={(e) => setParentName(e.target.value)} maxLength={120} />
          </label>
          <label className="space-y-1">
            <span className={label}>Branş</span>
            <select className={field} value={instrument} onChange={(e) => setInstrument(e.target.value)}>
              {(instrumentOptions.includes(row.instrument) ? instrumentOptions : [row.instrument, ...instrumentOptions]).map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className={label}>Şube</span>
            <select className={field} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className={label}>Öğretmen</span>
            <select className={field} value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={isTeacher}>
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className={label}>Tarih / saat</span>
            <input
              type="datetime-local"
              className={field}
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className={label}>Süre</span>
            <select className={field} value={duration} onChange={(e) => setDuration(e.target.value)}>
              {durationOptions.map((d) => (
                <option key={d} value={d}>
                  {d} dk{d === row.durationMinutes && ![10, 15, 20].includes(d) ? " (mevcut kayıt)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-1">
          <span className={label}>Hazırlık notu (ders öncesi)</span>
          <textarea
            className={`${field} min-h-[72px]`}
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ör. adayın seviyesi, velinin beklentisi, hazırlanacak nota"
          />
        </label>
        <label className="block space-y-1">
          <span className={label}>Sonuç / görüşme notu (ders sonrası)</span>
          <textarea
            className={`${field} min-h-[72px]`}
            value={resultNotes}
            maxLength={4000}
            onChange={(e) => setResultNotes(e.target.value)}
            placeholder="Ör. dersin nasıl geçtiği, veliyle görüşme, kayıt kararı"
          />
          {row.resultNotesLabel ? <span className="text-[11px] text-[var(--color-text-muted)]">{row.resultNotesLabel}</span> : null}
        </label>
        {needsOverride ? (
          <label className="flex items-start gap-2 text-xs text-[var(--color-text)]">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="mt-0.5" />
            Öğretmenin müsaitlik penceresi dışında olduğunu biliyorum; yine de bu saate planla (denetim kaydına yazılır).
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs font-medium" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        ) : null}
      </div>
    </ModalShell>
  );
}
