"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/modal-shell";
import { actionPreviewEmail, actionSendTemplateEmail } from "@/lib/recruitment/actions";
import { EMAIL_KIND_LABELS, EMAIL_PLACEHOLDERS } from "@/lib/recruitment/email-meta";
import { STAGE_LABELS, STAGES } from "@/lib/recruitment/constants";
import type { ApplicationStage, EmailTemplateKind, RecruitmentEmailTemplate } from "@/lib/recruitment/types";

/** Şablon türüne göre önerilen aşama (yönetici değiştirebilir / kapatabilir). */
const SUGGESTED_STAGE: Partial<Record<EmailTemplateKind, ApplicationStage>> = {
  negative: "rejected",
  offer: "offer",
  positive: "screening",
};

const inputCls =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]/30";

export function EmailComposer({
  open,
  onClose,
  ids,
  templates,
  defaultKind,
  recipientsLabel,
}: {
  open: boolean;
  onClose: () => void;
  ids: string[];
  templates: RecruitmentEmailTemplate[];
  defaultKind?: EmailTemplateKind;
  recipientsLabel: string;
}) {
  const router = useRouter();
  const active = useMemo(() => templates.filter((t) => t.active), [templates]);
  const initial = active.find((t) => t.kind === defaultKind) ?? active[0];
  const [templateId, setTemplateId] = useState(initial?.id ?? "");
  const tpl = active.find((t) => t.id === templateId);
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [moveTo, setMoveTo] = useState<ApplicationStage | "">(initial ? SUGGESTED_STAGE[initial.kind] ?? "" : "");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    const t = active.find((x) => x.kind === defaultKind) ?? active[0];
    // Diyalog her açıldığında seçilen türe göre sıfırla.
    /* eslint-disable react-hooks/set-state-in-effect */
    setTemplateId(t?.id ?? "");
    setSubject(t?.subject ?? "");
    setBody(t?.body ?? "");
    setMoveTo(t ? SUGGESTED_STAGE[t.kind] ?? "" : "");
    setPreview(null);
    setResult(null);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, defaultKind, active]);

  function pick(id: string) {
    const t = active.find((x) => x.id === id);
    setTemplateId(id);
    setSubject(t?.subject ?? "");
    setBody(t?.body ?? "");
    setMoveTo(t ? SUGGESTED_STAGE[t.kind] ?? "" : "");
    setPreview(null);
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      busy={pending}
      size="lg"
      title={`E-posta gönder — ${recipientsLabel}`}
      footer={
        result ? (
          <button type="button" onClick={onClose} className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white">
            Kapat
          </button>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={pending || !templateId}
              onClick={() =>
                start(async () => {
                  const r = await actionPreviewEmail({ applicationId: ids.length === 1 ? ids[0] : undefined, subject, body });
                  if (r.ok) setPreview(r.data.html);
                  else setError(r.message);
                })
              }
              className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-4 py-2 text-sm font-medium"
            >
              Önizle
            </button>
            <button
              type="button"
              disabled={pending || !templateId || ids.length === 0}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await actionSendTemplateEmail({
                    ids,
                    templateId,
                    subject: subject !== tpl?.subject ? subject : undefined,
                    body: body !== tpl?.body ? body : undefined,
                    moveToStage: moveTo || undefined,
                  });
                  if (!r.ok) {
                    setError(r.message);
                    return;
                  }
                  const d = r.data;
                  setResult(
                    d.blocked && d.sent === 0
                      ? `E-postalar GÖNDERİLEMEDİ: bu ortamda e-posta sağlayıcısı (SMTP) yapılandırılmamış. ${d.failed} aday için deneme zaman çizelgesine kaydedildi${moveTo ? `; aşama "${STAGE_LABELS[moveTo]}" olarak güncellendi` : ""}.`
                      : `${d.sent} e-posta gönderildi${d.failed ? `, ${d.failed} gönderilemedi` : ""}${d.skipped ? `, ${d.skipped} atlandı` : ""}.${moveTo ? ` Aşama "${STAGE_LABELS[moveTo]}" olarak güncellendi.` : ""}`
                  );
                  router.refresh();
                })
              }
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Gönderiliyor…" : `${ids.length} adaya gönder`}
            </button>
          </div>
        )
      }
    >
      {result ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] p-4 text-sm" role="status">{result}</p>
      ) : (
        <div className="space-y-4">
          {active.length === 0 ? <p className="text-sm">Etkin şablon yok. Önce E-posta şablonları sekmesinden bir şablon oluşturun.</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Şablon</span>
              <select className={inputCls} value={templateId} onChange={(e) => pick(e.target.value)}>
                {active.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({EMAIL_KIND_LABELS[t.kind]})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Gönderimden sonra aşama</span>
              <select className={inputCls} value={moveTo} onChange={(e) => setMoveTo(e.target.value as ApplicationStage | "")}>
                <option value="">Değiştirme</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Konu</span>
            <input className={inputCls} value={subject} onChange={(e) => { setSubject(e.target.value); setPreview(null); }} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">İleti</span>
            <textarea rows={9} className={`${inputCls} font-mono text-[13px]`} value={body} onChange={(e) => { setBody(e.target.value); setPreview(null); }} />
          </label>
          <p className="text-xs text-[var(--color-text-muted)]">
            Yer tutucular: {EMAIL_PLACEHOLDERS.map((p) => `{{${p.name}}}`).join(" · ")} — her adaya kendi bilgileriyle doldurulur. Buradaki düzenleme yalnız bu gönderim içindir; şablonu kalıcı değiştirmek için Şablonlar sekmesini kullanın.
          </p>
          {error ? <p role="alert" className="rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">{error}</p> : null}
          {preview ? (
            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <p className="bg-[var(--color-surface-muted)] px-3 py-1.5 text-xs font-medium">Önizleme {ids.length > 1 ? "(örnek aday ile)" : ""}</p>
              <iframe title="E-posta önizleme" sandbox="" srcDoc={preview} className="h-80 w-full bg-white" />
            </div>
          ) : null}
        </div>
      )}
    </ModalShell>
  );
}
