"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ModalShell, modalButton } from "@/components/modal-shell";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";
import { apiFetchJson } from "@/lib/api/client-fetch";
import {
  TRIAL_CONVERSION_PROMPT_STATUSES,
  TRIAL_STATUS_LABELS,
  trialConversionHref,
} from "@/lib/trial-lesson-labels";
import type { TrialLessonStatus } from "@/lib/types";

export type TrialRow = {
  id: string;
  name: string;
  phone: string;
  instrument: string;
  teacherName: string;
  branchName: string;
  startAt: string;
  startLabel: string;
  durationMinutes: number;
  status: TrialLessonStatus;
  createdByName: string;
  convertedStudentId?: string;
  convertedStudentName?: string;
  convertedByName?: string;
  convertedAtLabel?: string;
  isPast: boolean;
};

type Tab = "upcoming" | "past" | "open" | "all";
const TAB_LABELS: Record<Tab, string> = {
  upcoming: "Yaklaşan",
  past: "Geçmiş",
  open: "Dönüşmeyen",
  all: "Tümü",
};

/**
 * Deneme dersleri listesi — geçmiş + gelecek, planlayan personel ve dönüşüm
 * durumuyla. Statü "Katıldı / Kayıt bekleniyor / Devam edecek"e geçince
 * "Bu deneme öğrencisi kayda dönüştürülsün mü?" sorulur (dönüşüm yeni öğrenci
 * formunu ön doldurur; asıl kayıt orada onaylanır).
 */
export function TrialLessonsTable({
  rows,
  canWrite,
  initialPromptTrialId,
}: {
  rows: TrialRow[];
  canWrite: boolean;
  /** Az önce planlanan deneme — sayfa açılışında dönüşüm sorusu sorulur. */
  initialPromptTrialId?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptId, setPromptId] = useState<string | null>(
    initialPromptTrialId && rows.some((r) => r.id === initialPromptTrialId && !r.convertedStudentId) ? initialPromptTrialId : null
  );

  const counts: Record<Tab, number> = {
    upcoming: rows.filter((r) => !r.isPast).length,
    past: rows.filter((r) => r.isPast).length,
    open: rows.filter((r) => !r.convertedStudentId && r.status !== "cancelled" && r.status !== "will_not_continue").length,
    all: rows.length,
  };
  const visible = rows
    .filter((r) =>
      tab === "upcoming"
        ? !r.isPast
        : tab === "past"
          ? r.isPast
          : tab === "open"
            ? !r.convertedStudentId && r.status !== "cancelled" && r.status !== "will_not_continue"
            : true
    )
    // Yaklaşanlar en yakından, geçmiş en yeniden.
    .sort((a, b) => (tab === "upcoming" ? a.startAt.localeCompare(b.startAt) : b.startAt.localeCompare(a.startAt)));

  const prompt = rows.find((r) => r.id === promptId);

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

  return (
    <div>
      <div role="tablist" aria-label="Deneme dersi görünümü" className="mb-2 flex flex-wrap gap-1.5">
        {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              tab === key
                ? "border-[var(--color-trial)] bg-[var(--color-trial-soft)] text-[var(--color-text)]"
                : "border-[var(--color-border-strong)] text-[var(--color-text-muted)] hover:border-[var(--color-trial)]"
            }`}
          >
            {TAB_LABELS[key]} <span className="opacity-70">{counts[key]}</span>
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mb-2 text-xs font-medium" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              <th className="px-3 py-2">Aday</th>
              <th className="px-3 py-2">Tarih</th>
              <th className="px-3 py-2">Enstrüman · Öğretmen</th>
              <th className="px-3 py-2">Şube</th>
              <th className="px-3 py-2">Planlayan</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2">Kayıt</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">
                  Bu görünümde deneme dersi yok.
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border)] align-top last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-medium text-[var(--color-text)]">{r.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{r.phone}</p>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-[var(--color-text)]">{r.startLabel}</span>
                    <span className="block text-xs text-[var(--color-text-muted)]">{r.durationMinutes} dk</span>
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text)]">
                    {r.instrument}
                    <span className="block text-xs text-[var(--color-text-muted)]">{r.teacherName}</span>
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text-muted)]">{r.branchName}</td>
                  <td className="px-3 py-2 text-[var(--color-text)]">{r.createdByName}</td>
                  <td className="px-3 py-2">
                    {canWrite && !r.convertedStudentId ? (
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
                      <span className="text-xs font-medium text-[var(--color-text)]">{TRIAL_STATUS_LABELS[r.status] ?? r.status}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.convertedStudentId ? (
                      <div className="text-xs">
                        <Link
                          href={`/panel/ogrenciler/${r.convertedStudentId}`}
                          className="font-semibold text-[var(--color-success)] hover:underline"
                        >
                          Kayda dönüştü → {r.convertedStudentName ?? "Öğrenci"}
                        </Link>
                        <span className="block text-[var(--color-text-muted)]">
                          {r.convertedByName ?? "Bilinmeyen kullanıcı"}
                          {r.convertedAtLabel ? ` · ${r.convertedAtLabel}` : ""}
                        </span>
                      </div>
                    ) : canWrite && r.status !== "cancelled" && r.status !== "will_not_continue" ? (
                      <Link
                        href={trialConversionHref(r.id)}
                        className="inline-flex rounded-md border border-[var(--color-trial)] px-2 py-1 text-xs font-semibold text-[var(--color-trial)] hover:bg-[var(--color-trial-soft)]"
                      >
                        Kayda dönüştür
                      </Link>
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
