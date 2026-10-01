"use client";

import Link from "@/components/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Mail, Printer, ThumbsDown, ThumbsUp } from "lucide-react";
import { actionChangeStage } from "@/lib/recruitment/actions";
import { applicationNumber, CATEGORY_LABELS, EDUCATION_LABELS, SOURCE_LABELS, STAGE_LABELS, STAGES, fullName } from "@/lib/recruitment/constants";
import type { ApplicationStage, EmailTemplateKind, RecruitmentApplication, RecruitmentEmailTemplate, RecruitmentJob } from "@/lib/recruitment/types";
import { StageBadge, Rating, Chip } from "./badges";
import { EmailComposer } from "./email-composer";

const dateFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" });

export function PoolTable({
  applications,
  jobs,
  templates,
  filterQuery,
}: {
  applications: RecruitmentApplication[];
  jobs: RecruitmentJob[];
  templates: RecruitmentEmailTemplate[];
  filterQuery: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState<ApplicationStage | "">("");
  const [msg, setMsg] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ kind?: EmailTemplateKind } | null>(null);
  const [pending, start] = useTransition();
  const jobTitle = useMemo(() => new Map(jobs.map((j) => [j.id, j.title])), [jobs]);

  const allOn = applications.length > 0 && applications.every((a) => selected.has(a.id));
  const ids = [...selected].filter((id) => applications.some((a) => a.id === id));
  const scopeIds = ids.length ? ids : applications.map((a) => a.id);
  const idsParam = ids.length ? `${filterQuery ? "&" : ""}ids=${ids.join(",")}` : "";
  const printHref = `/ik-aday-dokum?${filterQuery}${idsParam}`;
  const csvHref = `/api/panel/ik/export?${filterQuery}${idsParam}`;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 shadow-[var(--shadow-sm)] print:hidden">
        <span className="px-1 text-sm font-medium">
          {ids.length ? `${ids.length} aday seçili` : `${applications.length} aday listeleniyor`}
        </span>
        <span className="mx-1 hidden h-5 w-px bg-[var(--color-border)] sm:block" />
        <select
          className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
          value={stage}
          onChange={(e) => setStage(e.target.value as ApplicationStage | "")}
          aria-label="Aşamayı değiştir"
        >
          <option value="">Aşamayı değiştir…</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!stage || ids.length === 0 || pending}
          onClick={() =>
            start(async () => {
              const r = await actionChangeStage({ ids, stage });
              setMsg(r.ok ? `${r.data.updated} adayın aşaması güncellendi.` : r.message);
              if (r.ok) {
                setSelected(new Set());
                setStage("");
                router.refresh();
              }
            })
          }
          className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Uygula
        </button>
        <span className="mx-1 hidden h-5 w-px bg-[var(--color-border)] sm:block" />
        <button type="button" disabled={ids.length === 0} onClick={() => setComposer({ kind: "positive" })} className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-3 py-1.5 text-sm disabled:opacity-50">
          <ThumbsUp className="h-4 w-4 text-[var(--color-success)]" /> Olumlu
        </button>
        <button type="button" disabled={ids.length === 0} onClick={() => setComposer({ kind: "negative" })} className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-3 py-1.5 text-sm disabled:opacity-50">
          <ThumbsDown className="h-4 w-4 text-[var(--color-danger)]" /> Olumsuz
        </button>
        <button type="button" disabled={ids.length === 0} onClick={() => setComposer({})} className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-3 py-1.5 text-sm disabled:opacity-50">
          <Mail className="h-4 w-4" /> E-posta
        </button>
        <span className="ml-auto flex gap-2">
          <a href={printHref} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-muted)]">
            <Printer className="h-4 w-4" /> Yazdır / PDF
          </a>
          <a href={csvHref} className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-muted)]">
            <Download className="h-4 w-4" /> Excel (CSV)
          </a>
        </span>
      </div>
      {msg ? <p className="mb-3 text-sm" role="status">{msg}</p> : null}

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-[var(--color-surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Tümünü seç"
                  checked={allOn}
                  onChange={() => setSelected(allOn ? new Set() : new Set(applications.map((a) => a.id)))}
                />
              </th>
              <th className="px-3 py-2.5">Aday</th>
              <th className="px-3 py-2.5">Pozisyon</th>
              <th className="px-3 py-2.5">Enstrüman</th>
              <th className="px-3 py-2.5">Deneyim</th>
              <th className="px-3 py-2.5">Eğitim</th>
              <th className="px-3 py-2.5">Puan</th>
              <th className="px-3 py-2.5">Aşama</th>
              <th className="px-3 py-2.5">Başvuru</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {applications.map((a) => (
              <tr key={a.id} className={`hover:bg-[var(--color-surface-muted)] ${selected.has(a.id) ? "bg-[var(--color-primary-soft)]/50" : ""}`}>
                <td className="px-3 py-2.5">
                  <input type="checkbox" aria-label={`${fullName(a)} seç`} checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                </td>
                <td className="px-3 py-2.5">
                  <Link href={`/panel/ik/adaylar/${a.id}`} className="font-medium hover:text-[var(--color-primary)]">
                    {fullName(a)}
                  </Link>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                    {applicationNumber(a.seq)}
                    {a.city ? ` · ${a.city}` : ""}
                    {a.cvFileId ? <FileText className="h-3.5 w-3.5" aria-label="CV var" /> : null}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div>{a.jobId ? jobTitle.get(a.jobId) ?? "—" : "Genel başvuru"}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {CATEGORY_LABELS[a.category]} · {SOURCE_LABELS[a.source]}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex max-w-[200px] flex-wrap gap-1">
                    {a.instruments.length ? a.instruments.map((i) => <Chip key={i} tone="primary">{i}</Chip>) : <span className="text-xs text-[var(--color-text-muted)]">—</span>}
                  </div>
                  {a.tags.length ? <div className="mt-1 flex flex-wrap gap-1">{a.tags.map((t) => <Chip key={t}>#{t}</Chip>)}</div> : null}
                </td>
                <td className="px-3 py-2.5 tabular-nums">
                  {a.experienceYears ?? "—"} yıl
                  {a.teachingYears !== null ? <div className="text-xs text-[var(--color-text-muted)]">{a.teachingYears} yıl öğretmenlik</div> : null}
                </td>
                <td className="px-3 py-2.5 text-xs">{a.educationLevel ? EDUCATION_LABELS[a.educationLevel] : "—"}</td>
                <td className="px-3 py-2.5"><Rating value={a.ratingAvg} /></td>
                <td className="px-3 py-2.5"><StageBadge stage={a.stage} /></td>
                <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-text-muted)]">{dateFmt.format(new Date(a.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EmailComposer
        open={composer !== null}
        onClose={() => setComposer(null)}
        ids={scopeIds}
        templates={templates}
        defaultKind={composer?.kind}
        recipientsLabel={`${scopeIds.length} aday`}
      />
    </div>
  );
}
