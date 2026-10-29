"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { Phone, Mail, CalendarClock } from "lucide-react";
import { apiFetch } from "@/lib/api/client-fetch";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";
import type { TrialApplication, TrialApplicationStatus } from "@/lib/trial-applications";
import { applicationInstruments } from "@/lib/trial-application-instruments";

const STATUS: Record<TrialApplicationStatus, { label: string; bg: string; fg: string }> = {
  new: { label: "Yeni", bg: "var(--color-trial-soft)", fg: "var(--color-trial)" },
  contacted: { label: "Arandı", bg: "var(--color-info-soft)", fg: "var(--color-info)" },
  planned: { label: "Planlandı", bg: "var(--color-success-soft)", fg: "var(--color-success)" },
  declined: { label: "Kayıt olmayacak", bg: "var(--color-surface-muted)", fg: "var(--color-text-muted)" },
};
type Filter = "open" | TrialApplicationStatus | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Açık" },
  { key: "new", label: "Yeni" },
  { key: "contacted", label: "Arandı" },
  { key: "planned", label: "Planlandı" },
  { key: "declined", label: "Kayıt olmayacak" },
  { key: "all", label: "Tümü" },
];

const stamp = (iso: string, withTime = true) =>
  new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
const slotLabel = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** 2026-10-05 — Deneme Dersleri > Başvurular. Durum/not burada; planlama mevcut deneme formuyla (ön dolu). */
export function TrialApplicationsList({
  applications,
  branches,
  teachers,
  handlerNames,
}: {
  applications: TrialApplication[];
  branches: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  handlerNames: Record<string, string>;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { open: 0, new: 0, contacted: 0, planned: 0, declined: 0, all: applications.length };
    for (const a of applications) {
      c[a.status]++;
      if (a.status === "new" || a.status === "contacted") c.open++;
    }
    return c;
  }, [applications]);
  const shown = applications.filter((a) =>
    filter === "all" ? true : filter === "open" ? a.status === "new" || a.status === "contacted" : a.status === filter
  );
  const branchName = (id?: string) => (id ? (branches.find((b) => b.id === id)?.name ?? "—") : "Fark etmez");
  const teacherName = (id?: string) => (id ? teachers.find((t) => t.id === id)?.name : undefined);

  async function update(id: string, patch: { status?: TrialApplicationStatus; staffNote?: string }) {
    setBusyId(id);
    setError(null);
    try {
      const res = await apiFetch("/api/v1/trial-applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const j = (await res.json()) as { ok: boolean; error?: { code?: string; message?: string } };
      if (!j.ok) setError(friendlyApiErrorMessage(j.error, "Başvuru güncellenemedi. Sayfayı yenileyip tekrar deneyin."));
      else router.refresh();
    } catch {
      setError("Başvuru güncellenemedi: sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Başvuru durumu">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className="rounded-full border px-3 py-1 text-xs font-medium"
            style={
              filter === f.key
                ? { background: "var(--color-text)", color: "var(--color-surface)", borderColor: "var(--color-text)" }
                : { borderColor: "var(--color-border)", color: "var(--color-text-muted)" }
            }
          >
            {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
          {applications.length === 0 ? "Henüz başvuru yok. Başvuru formu bağlantısını adaylarla paylaşın." : "Bu filtrede başvuru yok."}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          {shown.map((a) => {
            const st = STATUS[a.status];
            return (
              <li key={a.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--color-text)]">{a.name}</span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: st.bg, color: st.fg }}>
                      {st.label}
                    </span>
                    <span className="text-[11px] tabular-nums text-[var(--color-text-muted)]">{a.applicationNo}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--color-text)]">
                    {applicationInstruments(a).join(", ")} · {branchName(a.branchId)}
                    {a.age ? ` · ${a.age} yaş` : ""}
                    {a.parentName ? ` · Veli: ${a.parentName}` : ""}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <a href={`tel:${a.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 font-medium text-[var(--color-primary)]">
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                      {a.phone}
                    </a>
                    {a.email ? (
                      <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                        {a.email}
                      </a>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                    Başvuru: {stamp(a.createdAt)}
                    {a.source ? ` · kaynak: ${a.source}` : ""}
                    {a.handledAt ? ` · son işlem: ${handlerNames[a.handledByUserId ?? ""] ?? "Kayıtlı kullanıcı"}, ${stamp(a.handledAt)}` : ""}
                  </p>
                  {a.note ? (
                    <p className="mt-1.5 whitespace-pre-wrap text-xs text-[var(--color-text)]">
                      <span className="font-semibold">Adayın eğitim geçmişi bilgisi:</span> {a.note}
                    </p>
                  ) : null}
                </div>

                <div className="min-w-0">
                  <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Adayın tercihleri ({a.preferredSlots.length})
                  </p>
                  <p className="mb-1 text-[11px] text-[var(--color-text-muted)]">Kesin randevu değildir; adayla görüşüp onaylanan saatle planlayın.</p>
                  {a.preferredSlots.length ? (
                    <ol className="flex flex-wrap gap-1.5">
                      {a.preferredSlots.map((s, i) => {
                        const planned = a.status === "planned";
                        const text = (
                          <>
                            <span className="text-[var(--color-text-muted)]">{i + 1}.</span> {slotLabel(s.startAt)}
                            {s.branchId ? ` · ${branchName(s.branchId)}` : ""}
                            {teacherName(s.teacherId) ? <span className="text-[var(--color-text-muted)]"> · {teacherName(s.teacherId)}</span> : null}
                          </>
                        );
                        return (
                          <li key={`${s.startAt}-${s.branchId ?? ""}`}>
                            {planned ? (
                              <span className="inline-block rounded-md border border-[var(--color-border)] px-2 py-1 text-xs tabular-nums">{text}</span>
                            ) : (
                              <Link
                                href={`/panel/deneme?sekme=basvurular&planla=${encodeURIComponent(a.id)}&zaman=${encodeURIComponent(s.startAt)}${s.branchId ? `&sube=${encodeURIComponent(s.branchId)}` : ""}${s.teacherId ? `&ogretmen=${encodeURIComponent(s.teacherId)}` : ""}`}
                                className="inline-block rounded-md border border-[var(--color-border)] px-2 py-1 text-xs tabular-nums hover:border-[var(--color-trial)]"
                                title="Bu tercihle planlama formunu aç (kayıt, formu onaylayınca oluşur)"
                              >
                                {text}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="text-xs text-[var(--color-text-muted)]">Zaman yazmadı.</p>
                  )}
                  {a.availabilityNote ? <p className="mt-1.5 text-xs text-[var(--color-text)]">Not: {a.availabilityNote}</p> : null}
                  <div className="mt-2 flex gap-1.5">
                    <input
                      value={notes[a.id] ?? a.staffNote ?? ""}
                      onChange={(e) => setNotes((p) => ({ ...p, [a.id]: e.target.value }))}
                      maxLength={1000}
                      placeholder="Görüşme notu (ör. salı tekrar ara)"
                      aria-label={`${a.name} görüşme notu`}
                      className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs"
                    />
                    {notes[a.id] !== undefined && notes[a.id] !== (a.staffNote ?? "") ? (
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => void update(a.id, { staffNote: notes[a.id] })}
                        className="shrink-0 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium hover:bg-[var(--color-surface-muted)]"
                      >
                        Kaydet
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-row flex-wrap items-start gap-1.5 lg:w-40 lg:flex-col lg:items-stretch">
                  {a.status === "planned" && a.trialLessonId ? (
                    <Link
                      href={`/panel/deneme?deneme=${encodeURIComponent(a.trialLessonId)}`}
                      className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-center text-xs font-medium hover:bg-[var(--color-surface-muted)]"
                    >
                      Deneme dersini aç
                    </Link>
                  ) : (
                    <Link
                      href={`/panel/deneme?sekme=basvurular&planla=${encodeURIComponent(a.id)}`}
                      className="rounded-md px-3 py-1.5 text-center text-xs font-semibold text-white"
                      style={{ background: "var(--color-trial)" }}
                    >
                      Planla
                    </Link>
                  )}
                  {a.status !== "planned" ? (
                    <select
                      value={a.status}
                      disabled={busyId === a.id}
                      onChange={(e) => void update(a.id, { status: e.target.value as TrialApplicationStatus })}
                      aria-label={`${a.name} başvuru durumu`}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs"
                    >
                      <option value="new">Yeni</option>
                      <option value="contacted">Arandı</option>
                      <option value="declined">Kayıt olmayacak</option>
                    </select>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
