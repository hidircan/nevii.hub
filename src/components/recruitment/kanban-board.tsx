"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import { actionChangeStage } from "@/lib/recruitment/actions";
import { STAGE_LABELS, STAGES, fullName } from "@/lib/recruitment/constants";
import type { ApplicationStage, RecruitmentApplication } from "@/lib/recruitment/types";
import { Chip, Rating } from "./badges";

const COLUMNS: ApplicationStage[] = ["new", "screening", "interview", "demo_lesson", "offer", "hired", "talent_pool", "rejected"];

export function KanbanBoard({ applications, jobTitles }: { applications: RecruitmentApplication[]; jobTitles: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<ApplicationStage | null>(null);
  const [items, move] = useOptimistic(applications, (state, p: { id: string; stage: ApplicationStage }) =>
    state.map((a) => (a.id === p.id ? { ...a, stage: p.stage } : a))
  );

  const moveTo = (id: string, stage: ApplicationStage) => {
    const cur = items.find((a) => a.id === id);
    if (!cur || cur.stage === stage) return;
    start(async () => {
      move({ id, stage });
      const r = await actionChangeStage({ ids: [id], stage });
      if (!r.ok) setError(r.message);
      router.refresh();
    });
  };

  return (
    <div>
      {error ? <p role="alert" className="mb-3 text-sm text-[var(--color-danger)]">{error}</p> : null}
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">Kartı sürükleyip başka bir sütuna bırakın ya da karttaki menüden aşama seçin.{pending ? " Kaydediliyor…" : ""}</p>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colItems = items.filter((a) => a.stage === col);
          return (
            <section
              key={col}
              aria-label={STAGE_LABELS[col]}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col);
              }}
              onDragLeave={() => setOver((o) => (o === col ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) moveTo(id, col);
              }}
              className={`flex w-64 shrink-0 flex-col rounded-[var(--radius-lg)] border bg-[var(--color-surface-muted)] p-2 transition ${
                over === col ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"
              }`}
            >
              <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
                {STAGE_LABELS[col]} <span className="rounded-full bg-[var(--color-surface)] px-2 text-xs tabular-nums">{colItems.length}</span>
              </h2>
              <div className="flex min-h-24 flex-col gap-2">
                {colItems.map((a) => (
                  <article
                    key={a.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", a.id)}
                    className="cursor-grab rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 shadow-[var(--shadow-sm)] active:cursor-grabbing"
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/panel/ik/adaylar/${a.id}`} className="block truncate text-sm font-medium hover:text-[var(--color-primary)]">
                          {fullName(a)}
                        </Link>
                        <p className="truncate text-xs text-[var(--color-text-muted)]">{a.jobId ? jobTitles[a.jobId] ?? "—" : "Genel başvuru"}</p>
                      </div>
                      <Rating value={a.ratingAvg} />
                    </div>
                    {a.instruments.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {a.instruments.slice(0, 3).map((i) => <Chip key={i} tone="primary">{i}</Chip>)}
                      </div>
                    ) : null}
                    <select
                      aria-label={`${fullName(a)} aşaması`}
                      value={a.stage}
                      onChange={(e) => moveTo(a.id, e.target.value as ApplicationStage)}
                      className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                      ))}
                    </select>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
