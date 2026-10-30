"use client";

import { useState, type ReactNode } from "react";
import Link from "@/components/link";
import { Button, Card } from "@/components/ui";
import { callApi } from "@/components/platform/api";
import type { ListDef, ListField, ListRow, SiteListKey, SitePageSettings, SiteSectionId } from "@/lib/platform/site-page";
import { SITE_LOCALES, type SiteLinkKey, type SiteLocale } from "@/lib/site-locales";

const inputCls = "w-full rounded-lg border bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]";
const border = { borderColor: "var(--color-border)" } as const;
const iconBtn = "rounded-md border px-2 py-1 text-xs font-medium hover:bg-[var(--color-surface-muted)] disabled:opacity-40";

type Status = { kind: "ok" | "err"; text: string } | null;

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p role={status.kind === "err" ? "alert" : "status"} className={`text-sm font-medium ${status.kind === "err" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
      {status.text}
    </p>
  );
}

async function save(body: unknown): Promise<{ settings?: SitePageSettings; status: Status }> {
  const res = await callApi<{ settings: SitePageSettings }>("/api/v1/platform/site-page", "PUT", body);
  if (!res.ok) return { status: { kind: "err", text: res.error.message } };
  return { settings: res.data.settings, status: { kind: "ok", text: "Kaydedildi ve yayına girdi." } };
}

/** Sekmeler: içerikler sunucuda hazırlanır, burada yalnız seçilen gösterilir. */
export function SiteSettingsTabs({ tabs }: { tabs: { id: string; label: string; node: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Site ayarı bölümleri" className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={`rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium ${
              active === t.id ? "bg-[var(--color-surface-muted)] font-semibold text-[var(--color-primary)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={active !== t.id}>
          {t.node}
        </div>
      ))}
    </div>
  );
}

/** Bölüm sırası ve görünürlüğü. Karşılama, üst menü ve altbilgi sabittir. */
export function SiteSectionsPanel({
  initial,
  sections,
  alwaysVisible,
}: {
  initial: Pick<SitePageSettings, "order" | "hidden">;
  sections: { id: SiteSectionId; label: string; anchor: string }[];
  alwaysVisible: SiteSectionId[];
}) {
  const [order, setOrder] = useState(initial.order);
  const [hidden, setHidden] = useState(initial.hidden);
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);
  const byId = new Map(sections.map((s) => [s.id, s]));

  function move(i: number, delta: number) {
    setOrder((list) => {
      const next = [...list];
      const [item] = next.splice(i, 1);
      next.splice(i + delta, 0, item!);
      return next;
    });
  }

  async function submit() {
    setPending(true);
    const res = await save({ layout: { order, hidden } });
    setPending(false);
    setStatus(res.status);
  }

  return (
    <Card>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Bölümler</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Karşılama en üstte, altbilgi en altta sabittir. Kapatılan bölüm ve ona giden menü bağlantıları birlikte gizlenir;
          içeriği silinmez, istediğiniz an tekrar açabilirsiniz.
        </p>
        <ol className="divide-y rounded-lg border" style={border}>
          {order.map((id, i) => {
            const section = byId.get(id)!;
            const locked = alwaysVisible.includes(id);
            const isHidden = hidden.includes(id);
            return (
              <li key={id} className="flex flex-wrap items-center gap-2 px-3 py-2" style={border}>
                <span className={`min-w-0 flex-1 text-sm font-medium ${isHidden ? "text-[var(--color-text-muted)] line-through" : ""}`}>{section.label}</span>
                {locked ? <span className="text-xs text-[var(--color-text-muted)]">Satın alma için hep açık</span> : null}
                {!isHidden ? (
                  <a href={`/?onizleme=1#${section.anchor}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-[var(--color-primary)] hover:underline">
                    Önizle
                  </a>
                ) : null}
                <label className="inline-flex items-center gap-1.5 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={!isHidden}
                    disabled={locked}
                    onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((x) => x !== id) : [...h, id]))}
                  />
                  Görünür
                </label>
                <button type="button" className={iconBtn} style={border} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${section.label} yukarı`}>
                  ↑
                </button>
                <button type="button" className={iconBtn} style={border} disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`${section.label} aşağı`}>
                  ↓
                </button>
              </li>
            );
          })}
        </ol>
        <StatusLine status={status} />
        <Button disabled={pending} onClick={submit}>
          {pending ? "Kaydediliyor…" : "Kaydet ve yayınla"}
        </Button>
      </div>
    </Card>
  );
}

function RowField({ field, value, onChange }: { field: ListField; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
  const text = Array.isArray(value) ? value.join("\n") : (value ?? "");
  const multi = field.kind === "multiline" || field.kind === "lines";
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium">{field.label}</span>
      {multi ? (
        <textarea
          rows={field.kind === "lines" ? 4 : 2}
          value={text}
          onChange={(e) => onChange(field.kind === "lines" ? e.target.value.split("\n") : e.target.value)}
          className={inputCls}
          style={border}
        />
      ) : (
        <input value={text} onChange={(e) => onChange(e.target.value)} className={inputCls} style={border} />
      )}
    </label>
  );
}

function ListEditor({ def, locale, saved, fallback, onSaved }: {
  def: ListDef;
  locale: SiteLocale;
  saved: ListRow[] | undefined;
  fallback: ListRow[];
  onSaved: (s: SitePageSettings) => void;
}) {
  const [rows, setRows] = useState<ListRow[]>(saved ?? fallback);
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  const patch = (i: number, key: string, value: string | string[]) => setRows((list) => list.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const move = (i: number, delta: number) =>
    setRows((list) => {
      const next = [...list];
      const [item] = next.splice(i, 1);
      next.splice(i + delta, 0, item!);
      return next;
    });

  async function submit(payload: ListRow[] | null) {
    setPending(true);
    const res = await save({ list: { locale, key: def.key, rows: payload } });
    setPending(false);
    setStatus(res.status);
    if (res.settings) {
      onSaved(res.settings);
      if (payload === null) setRows(fallback);
    }
  }

  return (
    <details className="rounded-lg border p-3" style={border}>
      <summary className="cursor-pointer text-sm font-semibold hover:underline">
        {def.label} ({rows.length}){saved ? <span className="ml-1 font-normal text-[var(--color-primary)]">özel</span> : null}
      </summary>
      <div className="mt-3 space-y-3">
        {def.help ? <p className="text-xs text-[var(--color-text-muted)]">{def.help}</p> : null}
        {rows.map((row, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-3" style={border}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">{i + 1}. öğe</span>
              <span className="flex gap-1">
                <button type="button" className={iconBtn} style={border} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${i + 1}. öğeyi yukarı taşı`}>↑</button>
                <button type="button" className={iconBtn} style={border} disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`${i + 1}. öğeyi aşağı taşı`}>↓</button>
                <button type="button" className={iconBtn} style={border} onClick={() => setRows((list) => list.filter((_, j) => j !== i))}>Kaldır</button>
              </span>
            </div>
            {def.fields.map((f) => (
              <RowField key={f.key} field={f} value={row[f.key]} onChange={(v) => patch(i, f.key, v)} />
            ))}
          </div>
        ))}
        <StatusLine status={status} />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={rows.length >= def.max} onClick={() => setRows((list) => [...list, {}])}>
            Öğe ekle
          </Button>
          <Button disabled={pending} onClick={() => submit(rows)}>
            {pending ? "Kaydediliyor…" : "Kaydet ve yayınla"}
          </Button>
          {saved ? (
            <Button variant="secondary" disabled={pending} onClick={() => submit(null)}>
              Varsayılana dön
            </Button>
          ) : null}
        </div>
      </div>
    </details>
  );
}

/** Dil sekmeli liste içerikleri. Dil değişince editörler yeni dilin verisiyle yeniden kurulur. */
export function SiteListsPanel({
  defs,
  initial,
  defaults,
}: {
  defs: ListDef[];
  initial: SitePageSettings["lists"];
  defaults: Record<SiteLocale, Record<SiteListKey, ListRow[]>>;
}) {
  const [locale, setLocale] = useState<SiteLocale>("tr");
  const [lists, setLists] = useState(initial);
  return (
    <Card>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Listeler</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Dile göre ayrı kaydedilir. Özel liste yoksa o dilin varsayılan içeriği gösterilir.
        </p>
        <div role="tablist" aria-label="Dil" className="flex flex-wrap gap-1">
          {SITE_LOCALES.map((l) => (
            <button
              key={l.code}
              role="tab"
              type="button"
              aria-selected={locale === l.code}
              onClick={() => setLocale(l.code)}
              className={`rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium ${
                locale === l.code ? "bg-[var(--color-surface-muted)] font-semibold text-[var(--color-primary)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {defs.map((def) => (
            <ListEditor
              key={`${locale}-${def.key}`}
              def={def}
              locale={locale}
              saved={lists[locale]?.[def.key]}
              fallback={defaults[locale][def.key]}
              onSaved={(s) => setLists(s.lists)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Düğme hedefleri, iletişim bilgileri ve karşılama görseli. */
export function SiteLinksPanel({
  initial,
  fields,
  defaults,
  defaultContact,
}: {
  initial: Pick<SitePageSettings, "links" | "contact" | "heroShowcase">;
  fields: { key: SiteLinkKey; label: string }[];
  defaults: Record<SiteLinkKey, string>;
  defaultContact: { email?: string; phone?: string; address?: string };
}) {
  const [links, setLinks] = useState<Record<string, string>>({ ...initial.links });
  const [contact, setContact] = useState({ email: initial.contact.email ?? "", phone: initial.contact.phone ?? "", address: initial.contact.address ?? "" });
  const [showcase, setShowcase] = useState({ imageUrl: initial.heroShowcase?.imageUrl ?? "", imageAlt: initial.heroShowcase?.imageAlt ?? "", caption: initial.heroShowcase?.caption ?? "" });
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    const res = await save({ links, contact, heroShowcase: showcase.imageUrl.trim() ? showcase : null });
    setPending(false);
    setStatus(res.status);
  }

  const contactFields = [
    { key: "email", label: "E-posta" },
    { key: "phone", label: "Telefon" },
    { key: "address", label: "Adres" },
  ] as const;
  const showcaseFields = [
    { key: "imageUrl", label: "Dosya yolu (sitedeki bir dosya; boşsa animasyonlu panel gösterilir)" },
    { key: "imageAlt", label: "Görsel açıklaması" },
    { key: "caption", label: "Alt yazı" },
  ] as const;

  return (
    <Card>
      <div className="space-y-5">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Düğme hedefleri</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Boş alan varsayılan hedefi kullanır. Sayfa içi (#iletisim), site içi (/deneme), https://, mailto: ve tel: kabul edilir.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs font-medium">{f.label}</span>
                <input value={links[f.key] ?? ""} placeholder={defaults[f.key]} onChange={(e) => setLinks((l) => ({ ...l, [f.key]: e.target.value }))} className={inputCls} style={border} />
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">İletişim bilgileri</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {contactFields.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs font-medium">{f.label}</span>
                <input value={contact[f.key]} placeholder={defaultContact[f.key] ?? "Tanımlı değil"} onChange={(e) => setContact((c) => ({ ...c, [f.key]: e.target.value }))} className={inputCls} style={border} />
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Karşılama görseli</h2>
          <div className="grid gap-3">
            {showcaseFields.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs font-medium">{f.label}</span>
                <input value={showcase[f.key]} onChange={(e) => setShowcase((c) => ({ ...c, [f.key]: e.target.value }))} className={inputCls} style={border} />
              </label>
            ))}
          </div>
        </div>
        <StatusLine status={status} />
        <Button disabled={pending} onClick={submit}>
          {pending ? "Kaydediliyor…" : "Kaydet ve yayınla"}
        </Button>
      </div>
    </Card>
  );
}

/** Üst bilgi: kaydetmenin anlamı, kapsam ve başka ekranlarda yönetilen içerik. */
export function SiteScopeNote({ environment }: { environment: string }) {
  return (
    <Card>
      <div className="space-y-2 text-sm">
        <p>
          <strong>Kaydet = hemen yayın.</strong> Taslak yoktur; önceki sürüme Sürümler sekmesinden dönebilirsiniz. Bu ortam:{" "}
          <strong>{environment}</strong>; değişiklik yalnız bu ortamın verisine yazılır.
        </p>
        <p className="text-[var(--color-text-muted)]">
          Fiyatlar{" "}
          <Link href="/platform/paketler" className="font-medium text-[var(--color-primary)] hover:underline">Paketler</Link>
          , logo{" "}
          <Link href="/platform/marka" className="font-medium text-[var(--color-primary)] hover:underline">Platform markası</Link>
          , sözleşme ve politikalar{" "}
          <Link href="/platform/hukuki-belgeler" className="font-medium text-[var(--color-primary)] hover:underline">Hukuki belgeler</Link>{" "}
          ekranından yönetilir.
        </p>
        <a href="/?onizleme=1" target="_blank" rel="noreferrer" className="inline-block font-medium text-[var(--color-primary)] hover:underline">
          Yayındaki ana sayfayı yeni sekmede aç
        </a>
      </div>
    </Card>
  );
}
