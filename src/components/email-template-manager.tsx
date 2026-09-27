"use client";

/**
 * 10. tur iş #2 — e-posta şablonu yönetim arayüzü. Şablon/dil seçimi, alan
 * düzenleme (konu, ön başlık, giriş, gövde, imza, düğme metni, logo
 * görünürlüğü), yer-tutucu yardımcısı, canlı önizleme (sandbox'lı iframe),
 * test e-postası (yalnız kendi adresine), taslak kaydet / yayımla /
 * varsayılana dön ve sürüm geçmişi. Tüm yazma/doğrulama sunucudadır.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Input, Label, Select } from "@/components/ui";
import {
  actionGetEmailTemplate,
  actionPreviewEmailTemplate,
  actionPublishEmailTemplate,
  actionResetEmailTemplate,
  actionSaveEmailTemplateDraft,
  actionSendEmailTemplateTest,
} from "@/lib/actions";
import type { EmailTemplateSummary } from "@/lib/email-templates/tools";

type Fields = {
  subject: string;
  preheader: string;
  introHtml: string;
  bodyHtml: string;
  signatureHtml: string;
  ctaLabel: string;
  showLogo: boolean;
};

type Detail = {
  label: string;
  fields: Fields;
  source: "published" | "draft" | "default";
  version: number | null;
  defaultFields: Fields;
  placeholders: { name: string; label: string; required: boolean }[];
  versions: { version: number; status: string; createdBy: string | null; createdAt: string; updatedAt: string }[];
};

const EMPTY: Fields = { subject: "", preheader: "", introHtml: "", bodyHtml: "", signatureHtml: "", ctaLabel: "", showLogo: true };

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export function EmailTemplateManager({
  summaries,
  initialKey,
  initialLocale,
}: {
  summaries: EmailTemplateSummary[];
  initialKey: string;
  initialLocale: "tr" | "en";
}) {
  const [key, setKey] = useState(initialKey);
  const [locale, setLocale] = useState<"tr" | "en">(initialLocale);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);

  const load = useCallback(async (k: string, l: "tr" | "en") => {
    setLoading(true);
    setMessage(null);
    setPreviewHtml(null);
    setPreviewText(null);
    setPreviewVersion(null);
    const result = await actionGetEmailTemplate({ key: k, locale: l });
    setLoading(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    const d = result.detail as unknown as Detail;
    setDetail(d);
    setFields({ ...d.fields });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(key, locale);
  }, [key, locale, load]);

  const summary = summaries.find((s) => s.key === key);
  const locales = summary?.locales ?? (["tr"] as ("tr" | "en")[]);

  async function onSaveDraft() {
    setBusy(true);
    setMessage(null);
    const result = await actionSaveEmailTemplateDraft({ key, locale, fields });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setMessage({ tone: "ok", text: `Taslak kaydedildi (sürüm ${result.version}). Yayımlanmadan e-postalar değişmez.` });
    await load(key, locale);
  }

  async function onPublish(version: number) {
    setBusy(true);
    setMessage(null);
    const result = await actionPublishEmailTemplate({ key, locale, version });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setMessage({ tone: "ok", text: `Sürüm ${result.version} yayımlandı. Bundan sonra gönderilen e-postalar bu şablonu kullanır.` });
    await load(key, locale);
  }

  async function onReset() {
    if (!window.confirm("Bu şablonun tüm özel sürümleri arşivlenip varsayılan metne dönülsün mü? Geçmiş korunur.")) return;
    setBusy(true);
    setMessage(null);
    const result = await actionResetEmailTemplate({ key, locale });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setMessage({ tone: "ok", text: "Varsayılan şablona dönüldü." });
    await load(key, locale);
  }

  async function onPreview(version?: number) {
    setBusy(true);
    setMessage(null);
    const result = await actionPreviewEmailTemplate({ key, locale, version });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setPreviewHtml(result.preview.html);
    setPreviewText(result.preview.text);
    setPreviewVersion(version ?? detail?.version ?? null);
  }

  async function onSendTest() {
    setBusy(true);
    setMessage(null);
    const result = await actionSendEmailTemplateTest({ key, locale, version: detail?.version ?? undefined });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setMessage({
      tone: result.delivered ? "ok" : "error",
      text: result.delivered
        ? `Test e-postası ${result.to} adresine gönderildi. Kurum adı, logo, bağlantı ve kodu kontrol edin.`
        : "Test e-postası GÖNDERİLEMEDİ — bu ortamda e-posta sağlayıcısı yapılandırılmamış olabilir.",
    });
  }

  function insertPlaceholder(name: string) {
    setFields((f) => ({ ...f, bodyHtml: `${f.bodyHtml}{{${name}}}` }));
  }

  const sourceLabel = detail?.source === "published" ? "Yayında" : detail?.source === "draft" ? "Taslak" : "Varsayılan";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label>Şablon</Label>
          <Select value={key} onChange={(e) => setKey(e.target.value)} disabled={busy}>
            {summaries.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
                {s.publishedVersion ? ` (yayında: v${s.publishedVersion})` : " (varsayılan)"}
                {s.draftVersion ? ` • taslak: v${s.draftVersion}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Dil</Label>
          <Select value={locale} onChange={(e) => setLocale(e.target.value as "tr" | "en")} disabled={busy}>
            {locales.map((l) => (
              <option key={l} value={l}>
                {l === "tr" ? "Türkçe" : "English"}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end">
          <p className="text-xs text-[var(--color-text-muted)]">
            Düzenlenen: <strong>{sourceLabel}</strong>
            {detail?.version ? ` (sürüm ${detail.version})` : ""}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Yükleniyor…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label>Konu</Label>
              <Input value={fields.subject} disabled={busy} onChange={(e) => setFields({ ...fields, subject: e.target.value })} />
            </div>
            <div>
              <Label>Ön başlık (gelen kutusunda konu altında görünür, e-posta gövdesinde gizlidir)</Label>
              <Input value={fields.preheader} disabled={busy} onChange={(e) => setFields({ ...fields, preheader: e.target.value })} />
            </div>
            <div>
              <Label>Giriş metni</Label>
              <textarea
                value={fields.introHtml}
                disabled={busy}
                rows={3}
                onChange={(e) => setFields({ ...fields, introHtml: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
              />
            </div>
            <div>
              <Label>Gövde</Label>
              <textarea
                value={fields.bodyHtml}
                disabled={busy}
                rows={8}
                onChange={(e) => setFields({ ...fields, bodyHtml: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs text-[var(--color-text)]"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {detail?.placeholders.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    disabled={busy}
                    onClick={() => insertPlaceholder(p.name)}
                    title={p.label}
                    className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${
                      p.required
                        ? "border-amber-300 bg-amber-50 text-amber-900"
                        : "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"
                    }`}
                  >
                    {`{{${p.name}}}`}
                    {p.required ? " *" : ""}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                * işaretli alanlar zorunludur — gövdede yoksa şablon yayımlanamaz. Sınırlı HTML (paragraf, kalın,
                italik, liste, bağlantı) kullanılabilir; kod/script eklenemez.
              </p>
            </div>
            <div>
              <Label>İmza</Label>
              <textarea
                value={fields.signatureHtml}
                disabled={busy}
                rows={2}
                onChange={(e) => setFields({ ...fields, signatureHtml: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Eylem düğmesi metni</Label>
                <Input value={fields.ctaLabel} disabled={busy} onChange={(e) => setFields({ ...fields, ctaLabel: e.target.value })} />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <input
                  id="tpl-show-logo"
                  type="checkbox"
                  checked={fields.showLogo}
                  disabled={busy}
                  onChange={(e) => setFields({ ...fields, showLogo: e.target.checked })}
                />
                <Label>Kurum logosunu göster (kapalıysa kurum adı metin olarak görünür)</Label>
              </div>
            </div>
          </div>

          {message ? (
            <p className={`text-xs font-medium ${message.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>{message.text}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={onSaveDraft}>
              Taslağı kaydet
            </Button>
            <Button variant="secondary" disabled={busy || !detail?.version} onClick={() => detail?.version && onPublish(detail.version)}>
              Yayımla
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => onPreview(detail?.version ?? undefined)}>
              Önizle
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onSendTest}>
              Test e-postası gönder (yalnız bana)
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onReset}>
              Varsayılana dön
            </Button>
          </div>

          {previewHtml ? (
            <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
              <p className="text-xs font-semibold text-[var(--color-text)]">
                Önizleme{previewVersion ? ` (sürüm ${previewVersion})` : ""} — örnek veriyle
              </p>
              <iframe
                title="E-posta önizlemesi"
                sandbox=""
                srcDoc={previewHtml}
                className="h-96 w-full rounded-lg border border-[var(--color-border)] bg-white"
              />
              {previewText ? (
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-[var(--color-text-muted)]">Düz metin sürümü gör</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--color-surface-muted)] p-3 font-mono text-[11px] text-[var(--color-text)]">
                    {previewText}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}

          {detail && detail.versions.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Sürüm geçmişi</h3>
              <ul className="space-y-1.5">
                {detail.versions.map((v) => (
                  <li
                    key={v.version}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs"
                  >
                    <strong className="text-[var(--color-text)]">Sürüm {v.version}</strong>
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        v.status === "published"
                          ? "bg-emerald-50 text-emerald-800"
                          : v.status === "draft"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {v.status === "published" ? "Yayında" : v.status === "draft" ? "Taslak" : "Arşiv"}
                    </span>
                    <span className="text-[var(--color-text-muted)]">{formatDateTime(v.updatedAt)}</span>
                    <span className="ml-auto flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onPreview(v.version)}
                        className="font-medium text-[var(--color-primary)] hover:underline disabled:opacity-50"
                      >
                        Önizle
                      </button>
                      {v.status !== "published" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onPublish(v.version)}
                          className="font-medium text-[var(--color-primary)] hover:underline disabled:opacity-50"
                        >
                          Yayımla
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
