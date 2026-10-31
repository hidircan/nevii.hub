"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetchJson } from "@/lib/api/client-fetch";
import type { BlogCategory, BlogCover, BlogPost, BlogPostMeta } from "@/lib/marketing/blog";

type Form = {
  slug: string | null;
  builtin: boolean;
  category: string;
  title: string;
  description: string;
  body: string;
  coverAlt: string;
  cover: BlogCover | null;
  newCover: { mime: string; base64: string; preview: string; note: string } | null;
  removeCover: boolean;
};

const empty = (category: string): Form => ({ slug: null, builtin: false, category, title: "", description: "", body: "", coverAlt: "", cover: null, newCover: null, removeCover: false });

const coverUrl = (id: string) => `/blog/gorsel/${id}`;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

/** Telefondan gelen büyük fotoğraf sunucuya gitmeden küçülür; asıl sıkıştırma sunucuda yapılır. */
async function shrinkImage(file: File): Promise<{ mime: string; base64: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const preview = canvas.toDataURL("image/jpeg", 0.88);
  return { mime: "image/jpeg", base64: preview.split(",")[1]!, preview };
}

export function BlogManager({ posts, categories }: { posts: BlogPostMeta[]; categories: BlogCategory[] }) {
  const [form, setForm] = useState<Form | null>(null);
  const dirty = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const nameOf = useMemo(() => new Map(categories.map((c) => [c.slug, c.name])), [categories]);
  const coverTotal = posts.reduce((sum, p) => sum + (p.cover?.size ?? 0), 0);
  const coverCount = posts.filter((p) => p.cover).length;
  const words = form?.body.trim() ? form.body.trim().split(/\s+/).length : 0;

  // Uzun yazı yanlışlıkla kapatılan sekmeyle kaybolmasın.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  async function call<T>(body: unknown): Promise<T | null> {
    setBusy(true);
    setNotice(null);
    const res = await apiFetchJson<T>("/api/v1/platform/blog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      setNotice({ kind: "error", text: res.error.message });
      return null;
    }
    return res.data;
  }

  const update = (patch: Partial<Form>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    dirty.current = true;
  };

  async function edit(slug: string) {
    const data = await call<{ post: BlogPost }>({ action: "read", slug });
    if (!data) return;
    const p = data.post;
    setForm({ ...empty(p.category), slug: p.slug, builtin: p.builtin, category: p.category, title: p.title, description: p.description, body: p.body, cover: p.cover, coverAlt: p.cover?.alt ?? "" });
    dirty.current = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function pickCover(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setNotice({ kind: "error", text: "Yalnız PNG, JPEG veya WebP yüklenebilir. Dosyayı bu türlerden birine çevirip tekrar deneyin." });
      return;
    }
    try {
      const shrunk = await shrinkImage(file);
      update({ newCover: { ...shrunk, note: `Seçilen dosya ${kb(file.size)}. Kaydederken en fazla 300 KB'a küçültülür.` }, removeCover: false });
    } catch {
      setNotice({ kind: "error", text: "Görsel açılamadı. Dosya bozuk olabilir; başka bir PNG veya JPEG deneyin." });
    }
  }

  async function save(published: boolean) {
    if (!form) return;
    const data = await call<{ post: BlogPostMeta }>({
      action: "save",
      slug: form.slug,
      category: form.category,
      title: form.title,
      description: form.description,
      body: form.body,
      published,
      coverAlt: form.coverAlt,
      coverMime: form.newCover?.mime,
      coverBase64: form.newCover?.base64,
      removeCover: form.removeCover,
    });
    if (data) {
      dirty.current = false;
      window.location.reload();
    }
  }

  async function act(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    if (await call(body)) window.location.reload();
  }

  const input = "w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";
  const label = "mb-1 block text-xs font-medium text-[var(--color-text-muted)]";
  const btn = "rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60";
  const ghost = "rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-60";
  const previewCover = form?.newCover?.preview ?? (form?.cover && !form.removeCover ? coverUrl(form.cover.id) : null);

  return (
    <div className="space-y-4">
      {notice ? (
        <p role={notice.kind === "error" ? "alert" : "status"} className={`rounded-[var(--radius-md)] border px-4 py-2.5 text-sm ${notice.kind === "error" ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]" : "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]"}`}>
          {notice.text}
        </p>
      ) : null}

      {form ? (
        <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-base font-semibold">{form.slug ? "Yazıyı düzenle" : "Yeni yazı"}</h2>
          <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
            <div>
              <label className={label} htmlFor="blog-category">Kategori</label>
              <select id="blog-category" className={input} value={form.category} onChange={(e) => update({ category: e.target.value })}>
                {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="blog-title">Başlık</label>
              <input id="blog-title" className={input} maxLength={140} value={form.title} onChange={(e) => update({ title: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={label} htmlFor="blog-body">Yazı</label>
            <textarea id="blog-body" rows={22} className={`${input} leading-relaxed`} value={form.body} onChange={(e) => update({ body: e.target.value })} />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {words} kelime. Paragraflar arasında boş satır bırakın. Alt başlık için satıra <code>## </code> ile, madde için <code>- </code> ile başlayın.
            </p>
          </div>
          <div>
            <label className={label} htmlFor="blog-description">Kısa özet (isteğe bağlı)</label>
            <textarea id="blog-description" rows={2} maxLength={300} className={input} value={form.description} onChange={(e) => update({ description: e.target.value })} />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Listede ve Google sonuçlarında görünür. Boş bırakırsanız ilk paragraftan alınır.</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <p className={label}>Kapak görseli (isteğe bağlı)</p>
            {previewCover ? (
              // eslint-disable-next-line @next/next/no-img-element -- yerel önizleme veya kendi görsel adresimiz
              <img src={previewCover} alt="Kapak önizlemesi" className="mb-2 max-h-48 rounded-lg" />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="Kapak görseli seç" type="file" accept="image/png,image/jpeg,image/webp" className="text-xs" onChange={(e) => pickCover(e.target.files?.[0])} />
              {previewCover ? <button type="button" className={ghost} onClick={() => update({ newCover: null, removeCover: true })}>Görseli kaldır</button> : null}
            </div>
            {form.newCover ? <p className="mt-1 text-xs text-[var(--color-text-muted)]">{form.newCover.note}</p> : null}
            {previewCover ? (
              <div className="mt-2">
                <label className={label} htmlFor="blog-alt">Görsel açıklaması (Google ve ekran okuyucular için)</label>
                <input id="blog-alt" className={input} maxLength={160} value={form.coverAlt} onChange={(e) => update({ coverAlt: e.target.value })} />
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={btn} onClick={() => save(true)}>Yayınla</button>
            <button type="button" disabled={busy} className={ghost} onClick={() => save(false)}>Taslak olarak kaydet</button>
            <button type="button" disabled={busy} className={ghost} onClick={() => { if (!dirty.current || window.confirm("Kaydedilmemiş değişiklikler silinsin mi?")) { setForm(null); dirty.current = false; } }}>Vazgeç</button>
          </div>
        </section>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={busy} className={btn} onClick={() => { setForm(empty(categories[0]!.slug)); dirty.current = false; }}>Yeni yazı</button>
          <p className="text-xs text-[var(--color-text-muted)]">{posts.length} yazı · {coverCount} kapak görseli, toplam {kb(coverTotal)}</p>
        </div>
      )}

      <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {posts.map((p) => (
          <li key={p.slug} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{p.title}</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {nameOf.get(p.category) ?? p.category} · {p.published ? "Yayında" : "Taslak"} · {p.minutes} dk okuma{p.builtin ? " · Hazır yazı" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              <a className={ghost} href={p.published ? `/blog/${p.slug}` : `/blog/${p.slug}?onizleme=1`} target="_blank" rel="noreferrer">{p.published ? "Görüntüle" : "Önizle"}</a>
              <button type="button" disabled={busy} className={ghost} onClick={() => edit(p.slug)}>Düzenle</button>
              <button type="button" disabled={busy} className={ghost} onClick={() => act({ action: "publish", slug: p.slug, published: !p.published })}>
                {p.published ? "Yayından kaldır" : "Yayınla"}
              </button>
              {p.builtin ? (
                p.edited ? <button type="button" disabled={busy} className={ghost} onClick={() => act({ action: "delete", slug: p.slug }, "Yazı hazır hâline dönsün mü? Yaptığınız düzenlemeler silinir.")}>Hazır hâline döndür</button> : null
              ) : (
                <button type="button" disabled={busy} className={ghost} onClick={() => act({ action: "delete", slug: p.slug }, `"${p.title}" kalıcı olarak silinsin mi?`)}>Sil</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
