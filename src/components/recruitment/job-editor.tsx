"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionSaveJob } from "@/lib/recruitment/actions";
import { EMPLOYMENT_LABELS, JOB_STATUS_LABELS } from "@/lib/recruitment/constants";
import type { EmploymentType, JobStatus, RecruitmentJob } from "@/lib/recruitment/types";

const inputCls =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]/30";

const TEACHER_TEMPLATE = {
  description:
    "Kurumumuzda bireysel ve grup derslerini yürütecek, öğrencilerinin gelişimini takip edecek ve dönem sonu konserlerine hazırlayacak bir eğitmen arıyoruz.\n\n- Haftalık ders programına göre bireysel dersler\n- Öğrenci gelişim notları ve ödev takibi\n- Veli bilgilendirme görüşmeleri",
  requirements:
    "- İlgili alanda konservatuvar veya müzik eğitimi lisans mezuniyeti\n- En az 2 yıl öğretmenlik deneyimi (çocuk ve yetişkin)\n- Pedagojik yaklaşımı güçlü, iletişimi açık\n- Haftada en az 3 gün müsaitlik",
  benefits: "- Esnek ders programı\n- Düzenli hakediş ödemesi\n- Konser ve etkinliklerde sahne fırsatı\n- Mesleki gelişim atölyeleri",
};

export function JobEditor({ job, branches, instruments }: { job?: RecruitmentJob; branches: { id: string; name: string }[]; instruments: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    title: job?.title ?? "",
    category: job?.category ?? "teacher",
    instruments: job?.instruments ?? [],
    branchId: job?.branchId ?? "",
    employmentType: job?.employmentType ?? ("part_time" as EmploymentType),
    location: job?.location ?? "",
    summary: job?.summary ?? "",
    description: job?.description ?? "",
    requirements: job?.requirements ?? "",
    benefits: job?.benefits ?? "",
    closesAt: job?.closesAt ? job.closesAt.slice(0, 10) : "",
    slug: job?.slug ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const toggle = (i: string) => set("instruments", f.instruments.includes(i) ? f.instruments.filter((x) => x !== i) : [...f.instruments, i]);

  const save = (status: JobStatus) =>
    start(async () => {
      setErr(null);
      const r = await actionSaveJob({
        id: job?.id,
        ...f,
        branchId: f.branchId || null,
        closesAt: f.closesAt ? new Date(`${f.closesAt}T23:59:00+03:00`).toISOString() : null,
        slug: f.slug || undefined,
        status,
      });
      if (!r.ok) return setErr(r.message);
      router.push("/panel/ik/ilanlar");
      router.refresh();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">İlan başlığı *</span>
          <input className={inputCls} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="örn. Piyano Öğretmeni (Kadıköy)" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Kısa özet</span>
          <input className={inputCls} maxLength={400} value={f.summary} onChange={(e) => set("summary", e.target.value)} placeholder="Listede ve paylaşım kartında görünen tek cümle" />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Pozisyon hakkında</span>
          {!job && f.category === "teacher" && !f.description ? (
            <button type="button" className="text-xs font-medium text-[var(--color-primary)]" onClick={() => setF((p) => ({ ...p, ...TEACHER_TEMPLATE }))}>
              Örnek metinle doldur
            </button>
          ) : null}
        </div>
        <textarea rows={6} className={inputCls} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Görev tanımı. Madde listesi için satır başına '- ' yazın." />
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Aranan nitelikler</span>
          <textarea rows={5} className={inputCls} value={f.requirements} onChange={(e) => set("requirements", e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Sunduklarımız</span>
          <textarea rows={4} className={inputCls} value={f.benefits} onChange={(e) => set("benefits", e.target.value)} />
        </label>
      </div>

      <div className="space-y-4">
        <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm">
          <div>
            <span className="mb-1 block font-medium">Tür</span>
            <div className="flex gap-2">
              {(["teacher", "staff"] as const).map((c) => (
                <button key={c} type="button" onClick={() => set("category", c)} className={`flex-1 rounded-[var(--radius-md)] border px-3 py-1.5 ${f.category === c ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border-strong)]"}`}>
                  {c === "teacher" ? "Öğretmen" : "Personel"}
                </button>
              ))}
            </div>
          </div>
          {f.category === "teacher" ? (
            <div>
              <span className="mb-1 block font-medium">Enstrüman / branş</span>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {Array.from(new Set([...instruments, ...f.instruments])).map((i) => (
                  <button key={i} type="button" onClick={() => toggle(i)} className={`rounded-full border px-2.5 py-0.5 text-xs ${f.instruments.includes(i) ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white" : "border-[var(--color-border-strong)]"}`}>
                    {i}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <label className="block">
            <span className="mb-1 block font-medium">Çalışma şekli</span>
            <select className={inputCls} value={f.employmentType} onChange={(e) => set("employmentType", e.target.value as EmploymentType)}>
              {(Object.keys(EMPLOYMENT_LABELS) as EmploymentType[]).map((k) => <option key={k} value={k}>{EMPLOYMENT_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Şube</span>
            <select className={inputCls} value={f.branchId} onChange={(e) => { const b = branches.find((x) => x.id === e.target.value); setF((p) => ({ ...p, branchId: e.target.value, location: p.location || b?.name || "" })); }}>
              <option value="">Tüm şubeler / belirtilmedi</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Konum (ilanda görünür)</span>
            <input className={inputCls} value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="örn. Kadıköy, İstanbul" />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Son başvuru tarihi</span>
            <input type="date" className={inputCls} value={f.closesAt} onChange={(e) => set("closesAt", e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Bağlantı adı (opsiyonel)</span>
            <input className={inputCls} value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="başlıktan otomatik" />
          </label>
        </div>
        {err ? <p role="alert" className="rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">{err}</p> : null}
        <div className="flex flex-col gap-2">
          <button type="button" disabled={pending} onClick={() => save("published")} className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {job?.status === "published" ? "Kaydet (yayında)" : "Kaydet ve yayınla"}
          </button>
          <button type="button" disabled={pending} onClick={() => save(job && job.status !== "published" ? job.status : "draft")} className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-4 py-2 text-sm font-medium disabled:opacity-60">
            {job && job.status !== "published" ? `Kaydet (${JOB_STATUS_LABELS[job.status]})` : job ? "Yayından kaldır, taslak yap" : "Taslak olarak kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
