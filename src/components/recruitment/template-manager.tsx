"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { actionPreviewEmail, actionSaveTemplate } from "@/lib/recruitment/actions";
import { EMAIL_KIND_LABELS, EMAIL_PLACEHOLDERS } from "@/lib/recruitment/email-meta";
import type { EmailTemplateKind, RecruitmentEmailTemplate } from "@/lib/recruitment/types";

const inputCls =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]/30";

type Draft = { id?: string; kind: EmailTemplateKind; name: string; subject: string; body: string; active: boolean };

export function TemplateManager({ templates }: { templates: RecruitmentEmailTemplate[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<string>(templates[0]?.id ?? "new");
  const current = templates.find((t) => t.id === sel);
  const blank: Draft = { kind: "custom", name: "", subject: "", body: "", active: true };
  const [d, setD] = useState<Draft>(current ? { ...current } : blank);
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choose = (id: string) => {
    setSel(id);
    const t = templates.find((x) => x.id === id);
    setD(t ? { id: t.id, kind: t.kind, name: t.name, subject: t.subject, body: t.body, active: t.active } : blank);
    setPreview(null);
    setMsg(null);
  };

  const insert = (name: string) => setD((p) => ({ ...p, body: `${p.body}{{${name}}}` }));

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-1">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => choose(t.id)}
            className={`block w-full rounded-[var(--radius-md)] px-3 py-2 text-left text-sm ${sel === t.id ? "bg-[var(--color-primary-soft)] font-medium" : "hover:bg-[var(--color-surface-muted)]"}`}
          >
            {t.name}
            <span className="block text-xs text-[var(--color-text-muted)]">
              {EMAIL_KIND_LABELS[t.kind]}
              {!t.active ? " · pasif" : ""}
            </span>
          </button>
        ))}
        <button type="button" onClick={() => choose("new")} className="mt-2 inline-flex w-full items-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-3 py-2 text-sm">
          <Plus className="h-4 w-4" /> Yeni şablon
        </button>
      </aside>

      <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Şablon adı</span>
            <input className={inputCls} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Tür</span>
            <select className={inputCls} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as EmailTemplateKind })}>
              {(Object.keys(EMAIL_KIND_LABELS) as EmailTemplateKind[]).map((k) => <option key={k} value={k}>{EMAIL_KIND_LABELS[k]}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Konu</span>
          <input className={inputCls} value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">İleti (düz metin — paragraf için boş satır bırakın)</span>
          <textarea rows={12} className={`${inputCls} font-mono text-[13px]`} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} />
        </label>
        <div>
          <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">Yer tutucu ekle</p>
          <div className="flex flex-wrap gap-1.5">
            {EMAIL_PLACEHOLDERS.map((p) => (
              <button key={p.name} type="button" onClick={() => insert(p.name)} title={p.label} className="rounded-full border border-[var(--color-border-strong)] px-2 py-0.5 text-xs hover:bg-[var(--color-surface-muted)]">
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> Etkin (gönderim listelerinde görünür)
        </label>
        {d.kind === "received" ? (
          <p className="text-xs text-[var(--color-text-muted)]">&quot;Başvuru alındı&quot; türündeki etkin şablon, aday başvurusunu tamamladığında otomatik gönderilir (Ayarlar → otomatik onay e-postası açıksa).</p>
        ) : null}
        {msg ? <p className="text-sm" role="status">{msg}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await actionSaveTemplate(d);
                if (!r.ok) return setMsg(r.message);
                setMsg("Şablon kaydedildi.");
                setSel(r.data.template.id);
                setD({ ...d, id: r.data.template.id });
                router.refresh();
              })
            }
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Kaydet
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await actionPreviewEmail({ subject: d.subject, body: d.body });
                if (r.ok) setPreview(r.data.html);
                else setMsg(r.message);
              })
            }
            className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-4 py-2 text-sm font-medium"
          >
            Önizle (örnek aday)
          </button>
        </div>
        {preview ? <iframe title="Önizleme" sandbox="" srcDoc={preview} className="h-96 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white" /> : null}
      </div>
    </div>
  );
}
