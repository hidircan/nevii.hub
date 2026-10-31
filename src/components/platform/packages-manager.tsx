"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import { callApi } from "@/components/platform/api";
import type { CatalogModule, CatalogPlan, CommercialCatalog, PriceQuote } from "@/lib/platform/commercial-catalog";

type History = { id: string; version: number; status: string; reason: string; publishedAt: string | null; rollbackOfVersion: number | null };
export type CatalogOverviewData = {
  published: CommercialCatalog;
  publishedVersion: number | null;
  draft: CommercialCatalog | null;
  draftId: string | null;
  draftVersion: number | null;
  usage: Record<string, number>;
  history: History[];
  taxNote: string;
};

const API = "/api/v1/platform/catalog";
const tl = (minor: number | null) => (minor === null ? "Özel teklif" : (minor / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY" }));
const toMinor = (v: string) => Math.max(0, Math.round((Number(v.replace(",", ".")) || 0) * 100));
const limitText = (n: number | null) => (n === null ? "özel" : n.toLocaleString("tr-TR"));
const parseLimit = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v) || 0)));

type PlanConfirm = { key: string; label: string; action: "status" | "delete"; toActive: boolean; usage: number; reason: string } | null;

export function PackagesManager({ data }: { data: CatalogOverviewData }) {
  const router = useRouter();
  const working = data.draft ?? data.published;
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<PlanConfirm>(null);
  const [mod, setMod] = useState<(CatalogModule & { reason: string }) | null>(null);
  const [preview, setPreview] = useState<{ notes: string[]; blockers: string[]; changedKeys: string[] } | null>(null);
  const [quoteIn, setQuoteIn] = useState({ source: data.draft ? "draft" : "published", planKey: working.plans[0]?.key ?? "", cycle: "monthly", addons: [] as string[], adjType: "", adjValue: "", adjReason: "" });
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [rollback, setRollback] = useState({ toVersion: "", reason: "" });

  async function op<T>(body: Record<string, unknown>, okText?: string): Promise<T | null> {
    setMsg(null);
    const res = await callApi<T>(API, "POST", body);
    if (!res.ok) {
      setMsg({ kind: "err", text: res.error.message });
      return null;
    }
    if (okText) {
      setMsg({ kind: "ok", text: okText });
      router.refresh();
    }
    return res.data;
  }

  const planLabels = (k: string) => working.plans.filter((p) => p.includedModules.includes(k as CatalogPlan["includedModules"][number])).map((p) => p.label);

  return (
    <div className="space-y-4">
      {msg ? (
        <p role={msg.kind === "err" ? "alert" : "status"} className={`text-sm ${msg.kind === "err" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
          {msg.text}
        </p>
      ) : null}

      {data.draftId ? (
        <div role="status" className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--color-text)]">
            Yayınlanmamış değişikliğiniz var: ana sayfa ve satın alma hâlâ eski paketleri gösteriyor. Yansıması için yayınlayın.
          </p>
          <Button
            onClick={async () => {
              const d = await op<{ notes: string[]; blockers: string[]; changedKeys: string[] }>({ op: "preview", draftId: data.draftId });
              if (d) setPreview(d);
            }}
          >
            Önizle ve yayınla
          </Button>
        </div>
      ) : null}

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p>
            Yayındaki katalog: <strong>{data.publishedVersion ? `v${data.publishedVersion}` : "yerleşik (henüz yayın yok)"}</strong>
            {data.draft ? <> · Taslak: <strong>v{data.draftVersion}</strong> (yalnız siz görürsünüz; müşteriye yansımadı)</> : " · Taslak yok"}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Düzenlemeler taslakta birikir; anasayfaya yansıması için yayın gerekir. Yayın yalnız yeni satışlara uygulanır; mevcut kurumlar kabul ettikleri fiyat ve koşullarla sürer. {data.taxNote}
          </p>
        </div>
        {data.draftId ? (
          <span className="flex gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                const d = await op<{ notes: string[]; blockers: string[]; changedKeys: string[] }>({ op: "preview", draftId: data.draftId });
                if (d) setPreview(d);
              }}
            >
              Önizle ve yayınla
            </Button>
            <Button variant="ghost" onClick={() => op({ op: "discard", draftId: data.draftId }, "Taslak atıldı.")}>
              Taslağı at
            </Button>
          </span>
        ) : null}
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 className="text-sm font-semibold">Paketler {data.draft ? "(taslak)" : ""}</h2>
          <a
            href="/platform/paketler/yeni"
            className="rounded-lg bg-[var(--color-primary-soft)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-soft-text)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2"
          >
            Yeni paket
          </a>
        </div>
        <table className="mt-2 w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]" style={{ borderColor: "var(--color-border)" }}>
              <th className="max-w-[220px] px-4 py-2">Paket</th>
              <th className="whitespace-nowrap py-2 pr-4">Satış durumu</th>
              <th className="whitespace-nowrap py-2 pr-4 text-right">Aylık / yıllık (+KDV)</th>
              <th className="whitespace-nowrap py-2 pr-4">Limit özeti</th>
              <th className="whitespace-nowrap py-2 pr-4 text-right">Kullanan kurum</th>
              <th className="px-4 py-2">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {working.plans.map((p) => (
              <tr key={p.key} className="border-b align-top" style={{ borderColor: "var(--color-border)" }}>
                <td className="max-w-[220px] px-4 py-2">
                  <strong className="block truncate" title={p.label}>{p.label}</strong>
                  <span className="block truncate text-xs text-[var(--color-text-muted)]" title={p.key}><code>{p.key}</code></span>
                  {p.legacy ? <span className="mt-0.5 inline-block text-xs text-[var(--color-text-muted)]">eski sürüm · satışta yok</span> : null}
                  {p.builtin && !p.legacy ? <span className="mt-0.5 inline-block text-xs text-[var(--color-text-muted)]">yerleşik</span> : null}
                </td>
                <td className="whitespace-nowrap py-2 pr-4">
                  {p.legacy ? "Arşivde" : p.status === "active" ? "Satışta" : "Satışta gizli"}
                </td>
                <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums">
                  {p.pricing === "custom_quote" ? (
                    "Özel teklif"
                  ) : (
                    <>
                      {tl(p.basePriceMonthlyMinor)} / {tl(p.basePriceYearlyMinor)}
                      {!p.pricePublished ? <span className="block text-xs font-normal text-[var(--color-text-muted)]">iç fiyat · müşteriye gizli</span> : null}
                    </>
                  )}
                </td>
                <td className="whitespace-nowrap py-2 pr-4 text-xs">
                  {limitText(p.limits.students)} öğrenci · {limitText(p.limits.users)} kullanıcı · {limitText(p.limits.branches)} şube
                  <span className="block text-[var(--color-text-muted)]">{p.includedModules.length} modül dahil</span>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{data.usage[p.key] ?? 0}</td>
                <td className="px-4 py-2">
                  <span className="flex flex-wrap gap-1">
                    <a
                      href={`/platform/paketler/${encodeURIComponent(p.key)}/duzenle`}
                      className="rounded-lg bg-[var(--color-primary-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--color-primary-soft-text)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2"
                    >
                      Düzenle
                    </a>
                    {!p.legacy ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setMsg(null);
                          setConfirm({ key: p.key, label: p.label, action: "status", toActive: p.status !== "active", usage: data.usage[p.key] ?? 0, reason: "" });
                        }}
                      >
                        {p.status === "active" ? "Satıştan kaldır" : "Satışa al"}
                      </Button>
                    ) : null}
                    {!p.builtin || p.legacy ? (
                      <Button
                        variant="danger"
                        onClick={() => {
                          setMsg(null);
                          setConfirm({ key: p.key, label: p.label, action: "delete", toActive: false, usage: data.usage[p.key] ?? 0, reason: "" });
                        }}
                      >
                        Sil
                      </Button>
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {confirm ? (
        <Card className="space-y-3 border-[var(--color-warning)]">
          <h2 className="text-sm font-semibold">
            {confirm.action === "status"
              ? confirm.toActive ? `"${confirm.label}" satışa alınacak` : `"${confirm.label}" satıştan kaldırılacak`
              : `"${confirm.label}" kalıcı silinecek`}
          </h2>
          {confirm.action === "status" ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              {confirm.toActive
                ? "Paket yeni satışta görünür. Mevcut abonelikler değişmez."
                : `Paket yeni satışta gizlenir (arşivlenir). ${confirm.usage > 0 ? `${confirm.usage} kurum kabul ettiği koşullarla sürer; ` : "Kullanan kurum yok. "}Geçmiş teklif, sipariş ve belgeler korunur.`}
            </p>
          ) : confirm.usage > 0 ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              Bu paketi {confirm.usage} kurum kullanıyor; kalıcı silinemez. Önce “Satıştan kaldır”ın ve kurumları başka pakete taşıyın.
            </p>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">
              Kullanan kurum yok; taslaktan kalıcı kaldırılır. Geçmiş kayıtlar (teklif, sipariş, belge) silinmez.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-[2fr_auto_auto]">
            <Input
              aria-label="Gerekçe"
              placeholder="Gerekçe (en az 5 karakter, denetim kaydı için zorunlu)"
              value={confirm.reason}
              onChange={(e) => setConfirm({ ...confirm, reason: e.target.value })}
            />
            <Button
              variant={confirm.action === "delete" ? "danger" : "secondary"}
              disabled={confirm.action === "delete" && confirm.usage > 0}
              onClick={async () => {
                const c = confirm;
                setConfirm(null);
                if (c.action === "status") {
                  await op({ op: "plan_status", key: c.key, status: c.toActive ? "active" : "inactive", reason: c.reason }, "Taslak güncellendi.");
                } else {
                  await op({ op: "plan_delete", key: c.key, reason: c.reason }, "Paket taslaktan kaldırıldı.");
                }
              }}
            >
              Onayla
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Vazgeç
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-x-auto p-0">
        <h2 className="px-4 pt-3 text-sm font-semibold">Modüller ve eklenti fiyatları</h2>
        <table className="mt-2 w-full min-w-[1000px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]" style={{ borderColor: "var(--color-border)" }}>
              <th className="px-4 py-2">Modül</th>
              <th>Durum</th>
              <th>Aylık / yıllık</th>
              <th>Kullanım limiti</th>
              <th>Eklenti olarak satılır</th>
              <th>Dahil olduğu paketler</th>
              <th className="px-4">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {working.modules.map((m) => (
              <tr key={m.key} className="border-b align-top" style={{ borderColor: "var(--color-border)" }}>
                <td className="px-4 py-2">
                  <strong>{m.label}</strong>
                  <span className="block text-xs text-[var(--color-text-muted)]">{m.description}</span>
                </td>
                <td>{m.active ? "Aktif" : "Pasif"}</td>
                <td>
                  {tl(m.monthlyPriceMinor)} / {tl(m.yearlyPriceMinor)}
                </td>
                <td>{m.usageLimit === null ? "sınırsız" : `${m.usageLimit.toLocaleString("tr-TR")} ${m.usageUnit ?? ""}`}</td>
                <td>{m.sellableAsAddon ? "Evet" : "Hayır"}</td>
                <td className="text-xs">{planLabels(m.key).join(", ") || "—"}</td>
                <td className="px-4 py-2">
                  <Button variant="secondary" onClick={() => setMod({ ...m, reason: "" })}>
                    Düzenle
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {mod ? (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">Modül: {mod.label}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input aria-label="Modül adı" value={mod.label} onChange={(e) => setMod({ ...mod, label: e.target.value })} />
            <Input aria-label="Açıklama" value={mod.description} onChange={(e) => setMod({ ...mod, description: e.target.value })} />
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="text-xs text-[var(--color-text-muted)]">
              Aylık (₺)
              <Input type="number" min={0} step="0.01" value={mod.monthlyPriceMinor / 100} onChange={(e) => setMod({ ...mod, monthlyPriceMinor: toMinor(e.target.value) })} />
            </label>
            <label className="text-xs text-[var(--color-text-muted)]">
              Yıllık (₺)
              <Input type="number" min={0} step="0.01" value={mod.yearlyPriceMinor / 100} onChange={(e) => setMod({ ...mod, yearlyPriceMinor: toMinor(e.target.value) })} />
            </label>
            <label className="text-xs text-[var(--color-text-muted)]">
              Kullanım limiti (boş = sınırsız)
              <Input type="number" min={0} value={mod.usageLimit ?? ""} onChange={(e) => setMod({ ...mod, usageLimit: parseLimit(e.target.value) })} />
            </label>
            <label className="text-xs text-[var(--color-text-muted)]">
              Birim
              <Input value={mod.usageUnit ?? ""} placeholder="ör. SMS/ay" onChange={(e) => setMod({ ...mod, usageUnit: e.target.value || null })} />
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={mod.active} onChange={(e) => setMod({ ...mod, active: e.target.checked })} />
              Aktif
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={mod.sellableAsAddon} onChange={(e) => setMod({ ...mod, sellableAsAddon: e.target.checked })} />
              Eklenti olarak satılabilir
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-[2fr_auto_auto]">
            <Input aria-label="Gerekçe" placeholder="Gerekçe (en az 5 karakter)" value={mod.reason} onChange={(e) => setMod({ ...mod, reason: e.target.value })} />
            <Button
              onClick={async () => {
                if (await op({ op: "module_upsert", ...mod }, "Modül taslağa kaydedildi; denetim kaydı yazıldı.")) setMod(null);
              }}
            >
              Taslağa kaydet
            </Button>
            <Button variant="secondary" onClick={() => setMod(null)}>
              Kapat
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Fiyat hesaplayıcı</h2>
        <p className="text-xs text-[var(--color-text-muted)]">temel ücret + dahil modüller + seçili eklentiler ± indirim/override = toplam. {data.taxNote}</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <Select aria-label="Kaynak" value={quoteIn.source} onChange={(e) => setQuoteIn({ ...quoteIn, source: e.target.value })}>
            <option value="published">Yayındaki katalog</option>
            <option value="draft" disabled={!data.draft}>
              Taslak katalog
            </option>
          </Select>
          <Select aria-label="Paket" value={quoteIn.planKey} onChange={(e) => setQuoteIn({ ...quoteIn, planKey: e.target.value, addons: [] })}>
            {working.plans.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Dönem" value={quoteIn.cycle} onChange={(e) => setQuoteIn({ ...quoteIn, cycle: e.target.value })}>
            <option value="monthly">Aylık</option>
            <option value="yearly">Yıllık</option>
          </Select>
          <Select aria-label="Düzeltme" value={quoteIn.adjType} onChange={(e) => setQuoteIn({ ...quoteIn, adjType: e.target.value })}>
            <option value="">Düzeltme yok</option>
            <option value="discount_percent">% indirim</option>
            <option value="discount_amount">Tutar indirimi (₺)</option>
            <option value="override_total">Toplamı override et (₺)</option>
          </Select>
        </div>
        {quoteIn.adjType ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Input aria-label="Düzeltme değeri" type="number" min={0} placeholder={quoteIn.adjType === "discount_percent" ? "%" : "₺"} value={quoteIn.adjValue} onChange={(e) => setQuoteIn({ ...quoteIn, adjValue: e.target.value })} />
            <Input aria-label="Düzeltme gerekçesi" placeholder="Gerekçe" value={quoteIn.adjReason} onChange={(e) => setQuoteIn({ ...quoteIn, adjReason: e.target.value })} />
          </div>
        ) : null}
        <div className="grid gap-1 text-sm sm:grid-cols-3">
          {working.modules
            .filter((m) => m.active && m.sellableAsAddon && !working.plans.find((p) => p.key === quoteIn.planKey)?.includedModules.includes(m.key))
            .map((m) => (
              <label key={m.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={quoteIn.addons.includes(m.key)}
                  onChange={(e) => setQuoteIn({ ...quoteIn, addons: e.target.checked ? [...quoteIn.addons, m.key] : quoteIn.addons.filter((x) => x !== m.key) })}
                />
                + {m.label}
              </label>
            ))}
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            const adjustment = quoteIn.adjType
              ? {
                  type: quoteIn.adjType,
                  value: quoteIn.adjType === "discount_percent" ? Math.floor(Number(quoteIn.adjValue) || 0) : toMinor(quoteIn.adjValue),
                  reason: quoteIn.adjReason,
                }
              : null;
            const q = await op<PriceQuote>({ op: "quote", source: quoteIn.source, planKey: quoteIn.planKey, cycle: quoteIn.cycle, addons: quoteIn.addons, adjustment });
            setQuote(q);
          }}
        >
          Hesapla
        </Button>
        {quote ? (
          <table className="w-full text-sm">
            <tbody>
              {quote.lines.map((l) => (
                <tr key={`${l.kind}-${l.key}`} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-1">{l.label}</td>
                  <td className="text-right">{tl(l.amountMinor)}</td>
                </tr>
              ))}
              <tr className="border-t font-semibold" style={{ borderColor: "var(--color-border)" }}>
                <td className="py-1">Toplam ({quote.cycle === "yearly" ? "yıllık" : "aylık"}, KDV hariç)</td>
                <td className="text-right">{tl(quote.totalMinor)}</td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold">Katalog sürüm geçmişi</h2>
        <ul className="text-sm">
          {data.history.length === 0 ? <li className="text-[var(--color-text-muted)]">Henüz yayın yok (yerleşik katalog geçerli).</li> : null}
          {data.history.map((h) => (
            <li key={h.id}>
              v{h.version} · {h.status === "published" ? "yayında" : h.status === "superseded" ? "önceki" : h.status} · {h.reason}
              {h.rollbackOfVersion ? ` · v${h.rollbackOfVersion} sürümüne dönüş` : ""}
              {h.publishedAt ? <span className="text-xs text-[var(--color-text-muted)]"> · {new Date(h.publishedAt).toLocaleString("tr-TR")}</span> : null}
            </li>
          ))}
        </ul>
        {data.history.some((h) => h.status === "superseded") ? (
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <Input aria-label="Dönülecek sürüm" placeholder="sürüm no (boş = bir önceki)" value={rollback.toVersion} onChange={(e) => setRollback({ ...rollback, toVersion: e.target.value })} />
            <Input aria-label="Geri alma gerekçesi" placeholder="Gerekçe (en az 10 karakter)" value={rollback.reason} onChange={(e) => setRollback({ ...rollback, reason: e.target.value })} />
            <Button
              variant="danger"
              onClick={() =>
                op(
                  { op: "rollback", toVersion: rollback.toVersion ? Number(rollback.toVersion) : undefined, reason: rollback.reason, confirm: true },
                  "Önceki sürüm yeni sürüm olarak yayınlandı (eski kayıt silinmedi)."
                )
              }
            >
              Geri al
            </Button>
          </div>
        ) : null}
      </Card>

      {preview ? (
        <div role="alertdialog" aria-labelledby="pk-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-[var(--radius-lg)] border p-5 shadow-[var(--shadow-md)]" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            <h2 id="pk-title" className="text-base font-semibold">Katalog yayını — etki önizlemesi</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {preview.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            {preview.blockers.length ? <p className="mt-2 text-sm text-[var(--color-danger)]">Engel: {preview.blockers.join(" ")}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreview(null)}>
                Vazgeç
              </Button>
              <Button
                variant="danger"
                disabled={preview.blockers.length > 0}
                onClick={async () => {
                  setPreview(null);
                  await op({ op: "publish", draftId: data.draftId, confirm: true }, "Katalog yayınlandı; ana sayfa ve satın alma artık bu paketleri gösteriyor.");
                }}
              >
                Onayla ve yayınla
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
