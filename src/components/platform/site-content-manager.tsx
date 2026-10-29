"use client";

import { useMemo, useState } from "react";
import { Button, Card } from "@/components/ui";
import { callApi } from "@/components/platform/api";
import type { ContentField, ContentOverrides } from "@/lib/platform/site-content-overrides";
import { SITE_LOCALES, type SiteLocale } from "@/lib/site-locales";

type Props = {
  overrides: ContentOverrides;
  fields: ContentField[];
  defaults: Record<SiteLocale, Record<string, string>>;
};

const inputCls =
  "w-full rounded-lg border bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]";
const border = { borderColor: "var(--color-border)" } as const;

/** Anasayfa metinleri — dil sekmeli, bölümlü düzenleyici. Boş = kod varsayılanı. */
export function SiteContentManager({ overrides: initial, fields, defaults }: Props) {
  const [locale, setLocale] = useState<SiteLocale>("tr");
  const [saved, setSaved] = useState<ContentOverrides>(initial);
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(initial.tr ?? {}) }));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const sections = useMemo(() => {
    const map = new Map<string, ContentField[]>();
    for (const f of fields) {
      if (!map.has(f.section)) map.set(f.section, []);
      map.get(f.section)!.push(f);
    }
    return [...map.entries()];
  }, [fields]);

  const dirtyPaths = useMemo(() => {
    const base = saved[locale] ?? {};
    const paths = new Set([...Object.keys(base), ...Object.keys(values)]);
    return [...paths].filter((p) => (values[p] ?? "") !== (base[p] ?? ""));
  }, [values, saved, locale]);

  function switchLocale(next: SiteLocale) {
    setLocale(next);
    setValues({ ...(saved[next] ?? {}) });
    setError(null);
    setNotice(null);
  }

  async function save() {
    setError(null);
    setNotice(null);
    setPending(true);
    const payload: Record<string, string | null> = {};
    for (const p of dirtyPaths) payload[p] = values[p]?.trim() ? values[p]! : null;
    const res = await callApi<{ overrides: ContentOverrides }>("/api/v1/platform/site-content", "PUT", {
      locale,
      values: payload,
    });
    setPending(false);
    if (!res.ok) return setError(res.error.message);
    setSaved(res.data.overrides);
    const next = { ...(res.data.overrides[locale] ?? {}) };
    setValues(next);
    setNotice(`${dirtyPaths.length} alan kaydedildi. Anasayfa bir sonraki açılışta güncellenir.`);
  }

  return (
    <Card>
      <div className="space-y-4">
        <h2 className="text-sm font-semibold">Site metinleri</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Anasayfadaki başlık, açıklama ve düğme metinleri. Boş bırakılan alan varsayılan metni kullanır; değişiklik
          anında yayına yansır (önbellek temizliği gerekmez). Liste içerikleri (menü, SSS maddeleri) bu kapsamda değildir.
        </p>
        <div role="tablist" aria-label="Dil" className="flex flex-wrap gap-1">
          {SITE_LOCALES.map((l) => (
            <button
              key={l.code}
              role="tab"
              aria-selected={locale === l.code}
              onClick={() => switchLocale(l.code)}
              className={`rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium ${
                locale === l.code
                  ? "bg-[var(--color-surface-muted)] font-semibold text-[var(--color-primary)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        {sections.map(([section, items]) => (
          <details key={section} open={section === "Karşılama"}>
            <summary className="cursor-pointer text-sm font-semibold hover:underline">
              {section} ({items.filter((f) => values[f.path]?.trim()).length}/{items.length} özel)
            </summary>
            <div className="mt-2 space-y-3">
              {items.map((f) => {
                const custom = values[f.path]?.trim() ? true : false;
                return (
                  <div key={f.path}>
                    <label htmlFor={`sc-${f.path}`} className="mb-1 block text-xs font-medium">
                      {f.label}
                      {custom ? <span className="ml-1 font-normal text-[var(--color-primary)]">(özel)</span> : null}
                    </label>
                    {f.multiline ? (
                      <textarea
                        id={`sc-${f.path}`}
                        rows={2}
                        value={values[f.path] ?? ""}
                        placeholder={defaults[locale]?.[f.path] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [f.path]: e.target.value }))}
                        className={inputCls}
                        style={border}
                        maxLength={2000}
                      />
                    ) : (
                      <input
                        id={`sc-${f.path}`}
                        value={values[f.path] ?? ""}
                        placeholder={defaults[locale]?.[f.path] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [f.path]: e.target.value }))}
                        className={inputCls}
                        style={border}
                        maxLength={2000}
                      />
                    )}
                    <div className="mt-0.5 flex items-center gap-2">
                      {f.placeholders ? (
                        <span className="text-[11px] text-[var(--color-warning)]">
                          Yer tutucular korunmalı: {f.placeholders.join(", ")}
                        </span>
                      ) : null}
                      {custom ? (
                        <button
                          type="button"
                          onClick={() => setValues((v) => ({ ...v, [f.path]: "" }))}
                          className="text-[11px] text-[var(--color-text-muted)] hover:underline"
                        >
                          Varsayılana dön
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        ))}
        {error ? <p className="text-sm font-medium text-[var(--color-danger)]">{error}</p> : null}
        {notice ? <p className="text-sm font-medium text-[var(--color-success)]">{notice}</p> : null}
        <div className="flex items-center gap-2">
          <Button disabled={dirtyPaths.length === 0 || pending} onClick={save}>
            {pending ? "Kaydediliyor…" : `Kaydet (${dirtyPaths.length})`}
          </Button>
          {dirtyPaths.length === 0 ? <span className="text-xs text-[var(--color-text-muted)]">Değişiklik yok.</span> : null}
        </div>
      </div>
    </Card>
  );
}
