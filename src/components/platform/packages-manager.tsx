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

type PlanForm = Omit<CatalogPlan, "builtin" | "legacy"> & { isNew: boolean; reason: string };

function emptyPlan(): PlanForm {
  return {
    isNew: true,
    key: "",
    label: "",
    description: "",
    status: "active",
    limits: { students: 100, users: 3, branches: 1 },
    includedModules: [],
    pricing: "list",
    basePriceMonthlyMinor: 0,
    basePriceYearlyMinor: 0,
    pricePublished: false,
    reason: "",
  };
}

export function PackagesManager({ data }: { data: CatalogOverviewData }) {
  const router = useRouter();
  const working = data.draft ?? data.published;
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [plan, setPlan] = useState<PlanForm | null>(null);
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

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p>
            Yayındaki katalog: <strong>{data.publishedVersion ? `v${data.publishedVersion}` : "yerleşik (henüz yayın yok)"}</strong>
            {data.draft ? <> · Taslak: <strong>v{data.draftVersion}</strong> (internal — kullanıcıya görünmez)</> : " · Taslak yok"}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Düzenlemeler taslakta birikir. Yayın yalnız yeni aboneliklere uygulanır; mevcut kurumlar abonelik snapshot’ı ile korunur. {data.taxNote}
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
          <Button variant="secondary" onClick={() => setPlan(emptyPlan())}>
            Yeni paket
          </Button>
        </div>
        <table className="mt-2 w-full min-w-[1000px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]" style={{ borderColor: "var(--color-border)" }}>
              <th className="px-4 py-2">Paket</th>
              <th>Durum</th>
              <th>Öğrenci / kullanıcı / şube</th>
              <th>Modül</th>
              <th>Temel (ay / yıl)</th>
              <th>Fiyat</th>
              <th>Aktif abonelik</th>
              <th className="px-4">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {working.plans.map((p) => (
              <tr key={p.key} className="border-b align-top" style={{ borderColor: "var(--color-border)" }}>
                <td className="px-4 py-2">
                  <strong>{p.label}</strong> <code className="text-xs">{p.key}</code>
                  {p.legacy ? <span className="ml-1 text-xs text-[var(--color-text-muted)]">eski · yeni kurumda seçilemez</span> : null}
                  {p.builtin ? <span className="ml-1 text-xs text-[var(--color-text-muted)]">yerleşik</span> : null}
                </td>
                <td>{p.status === "active" ? "Aktif" : "Pasif"}</td>
                <td>
                  {limitText(p.limits.students)} / {limitText(p.limits.users)} / {limitText(p.limits.branches)}
                </td>
                <td>{p.includedModules.length}</td>
                <td>{p.pricing === "custom_quote" ? "Özel teklif" : `${tl(p.basePriceMonthlyMinor)} / ${tl(p.basePriceYearlyMinor)}`}</td>
                <td>{p.pricePublished ? "Yayınlanmış" : "Internal"}</td>
                <td>{data.usage[p.key] ?? 0}</td>
                <td className="px-4 py-2">
                  <span className="flex flex-wrap gap-1">
                    <Button variant="secondary" onClick={() => setPlan({ ...p, isNew: false, reason: "" })}>
                      Düzenle
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        const reason = window.prompt("Gerekçe (en az 5 karakter)") ?? "";
                        if (reason) void op({ op: "plan_status", key: p.key, status: p.status === "active" ? "inactive" : "active", reason }, "Taslak güncellendi.");
                      }}
                    >
                      {p.status === "active" ? "Pasifleştir" : "Aktifleştir"}
                    </Button>
                    {!p.builtin ? (
                      <Button
                        variant="danger"
                        onClick={() => {
                          const reason = window.prompt(`"${p.label}" taslaktan silinsin mi? Gerekçe (en az 5 karakter)`) ?? "";
                          if (reason) void op({ op: "plan_delete", key: p.key, reason }, "Paket taslaktan kaldırıldı.");
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

      {plan ? (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">{plan.isNew ? "Yeni paket (taslağa)" : `Paketi düzenle: ${plan.label}`}</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input aria-label="Anahtar" placeholder="anahtar (ör. studio)" value={plan.key} disabled={!plan.isNew} onChange={(e) => setPlan({ ...plan, key: e.target.value })} />
            <Input aria-label="Paket adı" placeholder="Paket adı" value={plan.label} onChange={(e) => setPlan({ ...plan, label: e.target.value })} />
            <Select aria-label="Fiyatlama" value={plan.pricing} onChange={(e) => setPlan({ ...plan, pricing: e.target.value as PlanForm["pricing"] })}>
              <option value="list">Liste fiyatı</option>
              <option value="custom_quote">Özel teklif</option>
            </Select>
          </div>
          <Input aria-label="Açıklama" placeholder="Açıklama" value={plan.description} onChange={(e) => setPlan({ ...plan, description: e.target.value })} />
          <div className="grid gap-2 sm:grid-cols-5">
            {(["students", "users", "branches"] as const).map((k) => (
              <label key={k} className="text-xs text-[var(--color-text-muted)]">
                {k === "students" ? "Aktif öğrenci" : k === "users" ? "Operasyon kullanıcısı" : "Şube"} (boş = özel)
                <Input type="number" min={0} value={plan.limits[k] ?? ""} onChange={(e) => setPlan({ ...plan, limits: { ...plan.limits, [k]: parseLimit(e.target.value) } })} />
              </label>
            ))}
            <label className="text-xs text-[var(--color-text-muted)]">
              Temel aylık (₺)
              <Input type="number" min={0} step="0.01" value={plan.basePriceMonthlyMinor / 100} onChange={(e) => setPlan({ ...plan, basePriceMonthlyMinor: toMinor(e.target.value) })} />
            </label>
            <label className="text-xs text-[var(--color-text-muted)]">
              Temel yıllık (₺)
              <Input type="number" min={0} step="0.01" value={plan.basePriceYearlyMinor / 100} onChange={(e) => setPlan({ ...plan, basePriceYearlyMinor: toMinor(e.target.value) })} />
            </label>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">Operasyon kullanıcısı = kurum sahibi, yönetici, şube müdürü, öğretmen. Öğrenci/veli portal hesapları sayılmaz.</p>
          <fieldset>
            <legend className="text-xs font-medium">Pakete dahil modüller</legend>
            <div className="mt-1 grid gap-1 text-sm sm:grid-cols-3">
              {working.modules.map((m) => (
                <label key={m.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={plan.includedModules.includes(m.key)}
                    onChange={(e) =>
                      setPlan({ ...plan, includedModules: e.target.checked ? [...plan.includedModules, m.key] : plan.includedModules.filter((x) => x !== m.key) })
                    }
                  />
                  {m.label}
                  {!m.active ? <span className="text-[10px] text-[var(--color-text-muted)]">pasif</span> : null}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={plan.pricePublished} onChange={(e) => setPlan({ ...plan, pricePublished: e.target.checked })} />
              Fiyatı kullanıcıya göster (yayında)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={plan.status === "active"} onChange={(e) => setPlan({ ...plan, status: e.target.checked ? "active" : "inactive" })} />
              Aktif (yeni kurumda seçilebilir)
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-[2fr_auto_auto]">
            <Input aria-label="Gerekçe" placeholder="Gerekçe (en az 5 karakter)" value={plan.reason} onChange={(e) => setPlan({ ...plan, reason: e.target.value })} />
            <Button
              onClick={async () => {
                // isNew sunucu şemasında yok; zod bilinmeyen alanı atar.
                if (await op({ op: "plan_upsert", ...plan }, "Paket taslağa kaydedildi; denetim kaydı yazıldı.")) setPlan(null);
              }}
            >
              Taslağa kaydet
            </Button>
            <Button variant="secondary" onClick={() => setPlan(null)}>
              Kapat
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
                  await op({ op: "publish", draftId: data.draftId, confirm: true }, "Katalog yayınlandı: yeni sürüm + denetim kaydı.");
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
