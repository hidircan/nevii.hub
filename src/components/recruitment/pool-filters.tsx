"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Filter, Search, X } from "lucide-react";
import {
  applicationFilterToSearchParams,
  countActiveFilters,
  type ApplicationFilter,
} from "@/lib/recruitment/filters";
import { EDUCATION_LABELS, SOURCE_LABELS, STAGE_LABELS, STAGES } from "@/lib/recruitment/constants";
import type { ApplicationSource, ApplicationStage, EducationLevel, RecruitmentJob } from "@/lib/recruitment/types";

const inputCls =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]/30";

function ChipToggle({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-2.5 py-1 text-xs transition ${
        on ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white" : "border-[var(--color-border-strong)] hover:bg-[var(--color-surface-muted)]"
      }`}
    >
      {children}
    </button>
  );
}

export function PoolFilters({
  initial,
  jobs,
  instruments,
  tags,
  cities,
}: {
  initial: ApplicationFilter;
  jobs: RecruitmentJob[];
  instruments: string[];
  tags: string[];
  cities: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState<ApplicationFilter>(initial);
  const [open, setOpen] = useState(countActiveFilters(initial) > (initial.q ? 1 : 0));

  const apply = (next: ApplicationFilter) => {
    const qs = applicationFilterToSearchParams(next).toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
  const set = <K extends keyof ApplicationFilter>(k: K, v: ApplicationFilter[K]) => setF((p) => ({ ...p, [k]: v }));
  const toggleIn = <T extends string>(list: T[] | undefined, v: T): T[] => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v]);
  const active = countActiveFilters(f);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply(f);
      }}
      className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 print:hidden"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-muted)]" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Ad, e-posta, telefon, okul, beceri, başvuru no…"
            value={f.q ?? ""}
            onChange={(e) => set("q", e.target.value || undefined)}
          />
        </div>
        <select className={`${inputCls} sm:w-40`} value={f.category ?? ""} onChange={(e) => apply({ ...f, category: (e.target.value || undefined) as ApplicationFilter["category"] })}>
          <option value="">Tüm adaylar</option>
          <option value="teacher">Öğretmen</option>
          <option value="staff">Personel</option>
        </select>
        <select className={`${inputCls} sm:w-52`} value={f.jobId ?? ""} onChange={(e) => apply({ ...f, jobId: e.target.value || undefined })}>
          <option value="">Tüm ilanlar</option>
          <option value="general">Genel başvurular</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>{j.title}</option>
          ))}
        </select>
        <select className={`${inputCls} sm:w-44`} value={f.sort ?? "newest"} onChange={(e) => apply({ ...f, sort: e.target.value as ApplicationFilter["sort"] })}>
          <option value="newest">En yeni</option>
          <option value="oldest">En eski</option>
          <option value="rating">Puan (yüksek)</option>
          <option value="experience">Deneyim (çok)</option>
          <option value="name">Ada göre</option>
        </select>
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-3 py-2 text-sm font-medium">
          <Filter className="h-4 w-4" /> Filtreler{active ? ` (${active})` : ""}
        </button>
        <button type="submit" className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white">Ara</button>
      </div>

      {open ? (
        <div className="mt-3 grid gap-4 border-t border-[var(--color-border)] pt-3 lg:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">Aşama</p>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map((s) => (
                <ChipToggle key={s} on={!!f.stages?.includes(s)} onClick={() => set("stages", toggleIn<ApplicationStage>(f.stages, s))}>
                  {STAGE_LABELS[s]}
                </ChipToggle>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">Enstrüman / branş (herhangi biri)</p>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {instruments.length === 0 ? <span className="text-xs text-[var(--color-text-muted)]">Henüz veri yok</span> : null}
              {instruments.map((i) => (
                <ChipToggle key={i} on={!!f.instruments?.some((x) => x.toLocaleLowerCase("tr") === i.toLocaleLowerCase("tr"))} onClick={() => set("instruments", toggleIn(f.instruments, i))}>
                  {i}
                </ChipToggle>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs">
              <span className="mb-1 block font-medium text-[var(--color-text-muted)]">Min. deneyim (yıl)</span>
              <input type="number" min={0} max={60} className={inputCls} value={f.minExperience ?? ""} onChange={(e) => set("minExperience", e.target.value === "" ? undefined : Number(e.target.value))} />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-[var(--color-text-muted)]">Min. öğretmenlik</span>
              <input type="number" min={0} max={60} className={inputCls} value={f.minTeaching ?? ""} onChange={(e) => set("minTeaching", e.target.value === "" ? undefined : Number(e.target.value))} />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-[var(--color-text-muted)]">En az eğitim</span>
              <select className={inputCls} value={f.education ?? ""} onChange={(e) => set("education", (e.target.value || undefined) as EducationLevel | undefined)}>
                <option value="">Fark etmez</option>
                {(Object.keys(EDUCATION_LABELS) as EducationLevel[]).filter(Boolean).map((k) => (
                  <option key={k} value={k}>{EDUCATION_LABELS[k]}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-[var(--color-text-muted)]">Min. puan</span>
              <select className={inputCls} value={f.minRating ?? ""} onChange={(e) => set("minRating", e.target.value === "" ? undefined : Number(e.target.value))}>
                <option value="">Fark etmez</option>
                {[4.5, 4, 3.5, 3].map((r) => (
                  <option key={r} value={r}>{r}+</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs">
              <span className="mb-1 block font-medium text-[var(--color-text-muted)]">Şehir</span>
              <input list="ik-cities" className={inputCls} value={f.city ?? ""} onChange={(e) => set("city", e.target.value || undefined)} />
              <datalist id="ik-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-[var(--color-text-muted)]">Başvuru (başlangıç)</span>
              <input type="date" className={inputCls} value={f.from ?? ""} onChange={(e) => set("from", e.target.value || undefined)} />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-[var(--color-text-muted)]">Başvuru (bitiş)</span>
              <input type="date" className={inputCls} value={f.to ?? ""} onChange={(e) => set("to", e.target.value || undefined)} />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-[var(--color-text-muted)]">Etiket</span>
              <select className={inputCls} value={f.tags?.[0] ?? ""} onChange={(e) => set("tags", e.target.value ? [e.target.value] : undefined)}>
                <option value="">Fark etmez</option>
                {tags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="lg:col-span-2">
            <p className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">Kaynak</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(SOURCE_LABELS) as ApplicationSource[]).map((s) => (
                <ChipToggle key={s} on={!!f.sources?.includes(s)} onClick={() => set("sources", toggleIn<ApplicationSource>(f.sources, s))}>
                  {SOURCE_LABELS[s]}
                </ChipToggle>
              ))}
            </div>
          </div>
          <div className="flex gap-2 lg:col-span-2">
            <button type="submit" className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white">Filtreleri uygula</button>
            <button type="button" onClick={() => { setF({}); apply({}); }} className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]">
              <X className="h-4 w-4" /> Temizle
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
