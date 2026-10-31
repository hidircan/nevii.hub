"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import { callApi } from "@/components/platform/api";
import { ModulePicker } from "@/components/platform/module-picker";
import { PricingAssistant } from "@/components/platform/pricing-assistant";
import type { CatalogModule, CatalogPlan } from "@/lib/platform/commercial-catalog";

export type PackageEditorInitial = {
  mode: "edit" | "new";
  plan: Omit<CatalogPlan, "builtin" | "legacy"> & { builtin: boolean; legacy: boolean };
  modules: CatalogModule[];
  publishedVersion: number | null;
  draftVersion: number | null;
  usageCount: number;
  /** Anahtar değişimi yalnız hiç kullanılmayan, yerleşik olmayan pakette. */
  renameAllowed: boolean;
};

type Form = {
  key: string;
  label: string;
  description: string;
  status: "active" | "inactive";
  limits: { students: string; users: string; branches: string };
  includedModules: string[];
  pricing: "list" | "custom_quote";
  monthlyTL: string;
  yearlyTL: string;
  pricePublished: boolean;
  reason: string;
};

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;
const toMinor = (v: string) => Math.max(0, Math.round((Number(v.replace(",", ".")) || 0) * 100));
const tl = (minor: number) => (minor / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

function toForm(p: PackageEditorInitial["plan"]): Form {
  return {
    key: p.key,
    label: p.label,
    description: p.description,
    status: p.status,
    limits: {
      students: p.limits.students === null ? "" : String(p.limits.students),
      users: p.limits.users === null ? "" : String(p.limits.users),
      branches: p.limits.branches === null ? "" : String(p.limits.branches),
    },
    includedModules: [...p.includedModules],
    pricing: p.pricing,
    monthlyTL: String(p.basePriceMonthlyMinor / 100),
    yearlyTL: String(p.basePriceYearlyMinor / 100),
    pricePublished: p.pricePublished,
    reason: "",
  };
}

function validate(f: Form, keyEditable: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (keyEditable && !KEY_PATTERN.test(f.key.trim())) e.key = "Anahtar küçük harf/rakam/alt çizgi, 2-32 karakter olmalı.";
  if (f.label.trim().length < 2 || f.label.trim().length > 60) e.label = "Paket adı 2-60 karakter olmalı.";
  if (f.description.trim().length > 300) e.description = "Açıklama en fazla 300 karakter.";
  for (const k of ["students", "users", "branches"] as const) {
    const v = f.limits[k].trim();
    if (v !== "" && (!/^\d+$/.test(v) || Number(v) > 1_000_000)) e[`limits.${k}`] = "0-1.000.000 arası tam sayı, boş = özel.";
  }
  for (const k of ["monthlyTL", "yearlyTL"] as const) {
    const minor = toMinor(f[k]);
    if (!Number.isFinite(minor) || minor < 0 || minor > 1_000_000_000) e[k] = "0 ile 10.000.000 ₺ arasında tutar girin.";
  }
  if (f.reason.trim().length < 5 || f.reason.trim().length > 300) e.reason = "Gerekçe 5-300 karakter (denetim kaydı için zorunlu).";
  return e;
}

export function PackageEditor({ initial }: { initial: PackageEditorInitial }) {
  const router = useRouter();
  const isNew = initial.mode === "new";
  const start = useMemo(() => toForm(initial.plan), [initial.plan]);
  const [form, setForm] = useState<Form>(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [renameAsk, setRenameAsk] = useState<{ oldKey: string; newKey: string } | null>(null);
  const [renameType, setRenameType] = useState("");
  const dirty = JSON.stringify({ ...form, reason: "" }) !== JSON.stringify({ ...start, reason: "" }) || form.reason !== "";

  useEffect(() => {
    if (!dirty || busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, busy]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(null);
  };

  const keyEditable = isNew || initial.renameAllowed;

  async function save() {
    const v = validate(form, keyEditable);
    setErrors(v);
    setServerError(null);
    if (Object.keys(v).length > 0) return;
    const newKey = form.key.trim();
    const renamed = !isNew && newKey !== initial.plan.key;
    // Kritik değişiklik (teknik kimlik) onaysız kaydedilmez: yazarak doğrulama.
    if (renamed) {
      setRenameType("");
      setRenameAsk({ oldKey: initial.plan.key, newKey });
      return;
    }
    await doSave(newKey, false);
  }

  async function doSave(newKey: string, renamed: boolean) {
    setBusy(true);
    // Anahtar değiştiyse önce güvenli taşıma (sunucu referansları yeniden doğrular),
    // ardından diğer alanlar yeni anahtarla kaydedilir (kayıp yok).
    if (renamed) {
      const rn = await callApi("/api/v1/platform/catalog", "POST", {
        op: "plan_rename",
        key: initial.plan.key,
        newKey,
        reason: form.reason.trim(),
      });
      if (!rn.ok) {
        setBusy(false);
        setServerError(rn.error.message);
        return;
      }
    }
    const parseLimit = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.floor(Number(s) || 0)));
    const res = await callApi("/api/v1/platform/catalog", "POST", {
      op: "plan_upsert",
      key: newKey,
      label: form.label.trim(),
      description: form.description.trim(),
      status: form.status,
      limits: { students: parseLimit(form.limits.students), users: parseLimit(form.limits.users), branches: parseLimit(form.limits.branches) },
      includedModules: form.includedModules,
      pricing: form.pricing,
      basePriceMonthlyMinor: toMinor(form.monthlyTL),
      basePriceYearlyMinor: toMinor(form.yearlyTL),
      pricePublished: form.pricePublished,
      reason: form.reason.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setServerError(
        renamed
          ? `Anahtar "${newKey}" olarak değişti ama diğer alanlar kaydedilemedi: ${res.error.message} Yeni düzenleme adresine geçin.`
          : res.error.message
      );
      return;
    }
    if (renamed) {
      router.push(`/platform/paketler/${encodeURIComponent(newKey)}/duzenle`);
      return;
    }
    setSaved(isNew ? "Paket taslağa eklendi. Ana sayfaya yansıması için Paketler ekranından yayınlayın." : "Paket taslağa kaydedildi. Ana sayfaya yansıması için Paketler ekranından yayınlayın.");
    router.refresh();
  }

  const label = "mb-1 block text-xs font-medium text-[var(--color-text)]";
  const hint = "mt-0.5 text-xs text-[var(--color-text-muted)]";
  const err = "mt-0.5 text-xs text-[var(--color-danger)]";
  const monthlyMinor = toMinor(form.monthlyTL);
  const yearlyMinor = toMinor(form.yearlyTL);

  return (
    <div className="space-y-4">
      <nav aria-label="Sayfa konumu" className="text-xs text-[var(--color-text-muted)]">
        <a href="/platform/paketler" className="hover:underline">Paketler ve Fiyatlar</a>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{isNew ? "Yeni paket" : `${initial.plan.label} paketini düzenle`}</span>
      </nav>
      <h1 className="text-xl font-semibold">{isNew ? "Yeni paket" : `${initial.plan.label} paketini düzenle`}</h1>
      <p className="text-sm text-[var(--color-text-muted)]">
        Düzenlenen: {initial.draftVersion !== null ? <>taslak <strong>v{initial.draftVersion}</strong> (yayınlanmadı)</> : <>yayındaki katalog <strong>{initial.publishedVersion ? `v${initial.publishedVersion}` : "yerleşik"}</strong> (kaydedince yeni taslak açılır)</>}.
        {initial.usageCount > 0 ? <> Bu paketi <strong>{initial.usageCount} kurum</strong> kullanıyor.</> : " Bu paketi kullanan kurum yok."}
      </p>
      <p className="rounded-lg bg-[var(--color-info-soft)] px-3 py-2 text-sm text-[var(--color-text)]">
        Bu değişiklik yeni satışlara uygulanır. Mevcut abonelikler kabul anındaki fiyat ve koşullarla sürer; katalog fiyatı değişince mevcut tahsilat sessizce değişmez.
      </p>

      {saved ? <p role="status" className="text-sm text-[var(--color-success)]">{saved} <a href="/platform/paketler" className="underline">Listeye dön</a></p> : null}
      {serverError ? <p role="alert" className="text-sm text-[var(--color-danger)]">Kaydedilemedi: {serverError}</p> : null}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Genel bilgiler</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="pe-key" className={label}>Paket anahtarı (teknik kimlik)</label>
            <Input id="pe-key" value={form.key} disabled={!keyEditable || busy} onChange={(e) => set("key", e.target.value)} />
            <p className={hint}>
              {isNew
                ? "Küçük harf/rakam/alt çizgi. Müşteri bu adı görmez; görünen ad ayrıdır."
                : keyEditable
                  ? "Bu paket hiç kullanılmadığından anahtar değiştirilebilir. Kaydedince adres de güncellenir."
                  : "Bu anahtar kullanımda (kurum/abonelik/davet/sipariş); değişmez. Müşterinin gördüğü adı değiştirebilirsiniz."}
            </p>
            {errors.key ? <p className={err}>{errors.key}</p> : null}
          </div>
          <div>
            <label htmlFor="pe-label" className={label}>Paket adı</label>
            <Input id="pe-label" value={form.label} disabled={busy} onChange={(e) => set("label", e.target.value)} />
            {errors.label ? <p className={err}>{errors.label}</p> : null}
          </div>
          <div>
            <label htmlFor="pe-status" className={label}>Durum</label>
            <Select id="pe-status" value={form.status} disabled={busy} onChange={(e) => set("status", e.target.value as Form["status"])}>
              <option value="active">Aktif (yeni kurumda seçilebilir)</option>
              <option value="inactive">Pasif (yeni satışta gizli)</option>
            </Select>
          </div>
        </div>
        <div>
          <label htmlFor="pe-desc" className={label}>Açıklama</label>
          <Input id="pe-desc" value={form.description} disabled={busy} onChange={(e) => set("description", e.target.value)} />
          <p className={hint}>Satış kartında görünür. Örnek fiyatlar ÖRNEK FİYAT diye işaretlenir.</p>
          {errors.description ? <p className={err}>{errors.description}</p> : null}
        </div>
        {initial.plan.builtin || initial.plan.legacy ? (
          <p className={hint}>{initial.plan.builtin ? "Yerleşik paket: silinemez, yalnız pasifleştirilir. " : ""}{initial.plan.legacy ? "Eski paket: yeni kurumda seçilemez." : ""}</p>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Aylık / yıllık fiyat</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="pe-pricing" className={label}>Fiyatlama türü</label>
            <Select id="pe-pricing" value={form.pricing} disabled={busy} onChange={(e) => set("pricing", e.target.value as Form["pricing"])}>
              <option value="list">Liste fiyatı</option>
              <option value="custom_quote">Özel teklif</option>
            </Select>
            <p className={hint}>Özel teklifte tutar yerine Özel teklif gösterilir.</p>
          </div>
          <div>
            <label htmlFor="pe-monthly" className={label}>Aylık tutar (₺, KDV hariç)</label>
            <Input id="pe-monthly" type="number" min={0} step="0.01" value={form.monthlyTL} disabled={busy} onChange={(e) => set("monthlyTL", e.target.value)} />
            {errors.monthlyTL ? <p className={err}>{errors.monthlyTL}</p> : null}
          </div>
          <div>
            <label htmlFor="pe-yearly" className={label}>Yıllık tutar (₺, KDV hariç)</label>
            <Input id="pe-yearly" type="number" min={0} step="0.01" value={form.yearlyTL} disabled={busy} onChange={(e) => set("yearlyTL", e.target.value)} />
            {errors.yearlyTL ? <p className={err}>{errors.yearlyTL}</p> : null}
          </div>
        </div>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold">Vergi gösterimi</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Liste fiyatları KDV hariç tutulur ve müşteriye + KDV ibaresiyle gösterilir. KDV oranı ve vergi hesabı kataloğun bu ekranından değil,
          doğrulanmış vergi yapılandırmasından gelir; oran doğrulanmadan gerçek checkout kapalı kalır.
        </p>
      </Card>

      <ModulePicker
        modules={initial.modules}
        selected={form.includedModules}
        disabled={busy}
        onChange={(v) => set("includedModules", v)}
      />

      <PricingAssistant
        onApply={(monthly, yearly) => {
          set("monthlyTL", monthly);
          set("yearlyTL", yearly);
          set("pricing", "list");
        }}
      />

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Limitler</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["students", "users", "branches"] as const).map((k) => (
            <div key={k}>
              <label htmlFor={`pe-${k}`} className={label}>
                {k === "students" ? "Aktif öğrenci" : k === "users" ? "Operasyon kullanıcısı" : "Şube"} (boş = özel)
              </label>
              <Input id={`pe-${k}`} type="number" min={0} value={form.limits[k]} disabled={busy} onChange={(e) => set("limits", { ...form.limits, [k]: e.target.value })} />
              {errors[`limits.${k}`] ? <p className={err}>{errors[`limits.${k}`]}</p> : null}
            </div>
          ))}
        </div>
        <p className={hint}>Operasyon kullanıcısı = kurum sahibi, yönetici, şube müdürü, öğretmen. Öğrenci/veli portal hesapları sayılmaz. Limit aşımı veri silmez; yalnız yeni kayıtları durdurur.</p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Satışta görünürlük</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={busy} checked={form.pricePublished} onChange={(e) => set("pricePublished", e.target.checked)} />
          Fiyatı müşteriye göster (yayında)
        </label>
        <p className={hint}>Kapalıysa fiyat kullanıcıya gösterilmez; checkout bu paket için kapanır.</p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Kaydetme</h2>
        <div>
          <label htmlFor="pe-reason" className={label}>Gerekçe (denetim kaydı için zorunlu)</label>
          <Input id="pe-reason" value={form.reason} disabled={busy} placeholder="Örn. Pro yıllık fiyat güncellendi, kampanya öncesi" onChange={(e) => set("reason", e.target.value)} />
          {errors.reason ? <p className={err}>{errors.reason}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={save}>{busy ? "Kaydediliyor…" : "Taslağı kaydet"}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "Önizlemeyi kapat" : "Önizle"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => router.push("/platform/paketler")}>Vazgeç</Button>
          <a href="/platform/paketler" className="ml-auto self-center text-sm underline text-[var(--color-text-muted)]">
            Yayın akışı liste ekranında (taslağın tamamı birlikte yayınlanır)
          </a>
        </div>
        {dirty && !busy ? <p className="text-xs text-[var(--color-text-muted)]">Kaydedilmemiş değişiklik var; sayfadan ayrılırsanız kaybolur.</p> : null}
      </Card>

      {showPreview ? (
        <Card>
          <h2 className="text-sm font-semibold">Taslak önizlemesi (müşteri kartı nasıl görünür)</h2>
          <div className="mt-2 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--color-border)" }}>
            <p className="font-semibold">{form.label || "(adsız paket)"}</p>
            {form.description ? <p className="text-[var(--color-text-muted)]">{form.description}</p> : null}
            {form.pricing === "custom_quote" ? (
              <p className="mt-2 text-lg font-semibold">Özel teklif</p>
            ) : form.pricePublished ? (
              <div className="mt-2 space-y-1">
                <p className="text-lg font-semibold">{tl(monthlyMinor)} / ay + KDV</p>
                <p className="text-lg font-semibold">{tl(yearlyMinor)} / yıl + KDV</p>
              </div>
            ) : (
              <p className="mt-2 font-medium text-[var(--color-warning)]">Fiyat müşteriye gösterilmiyor; checkout kapalı.</p>
            )}
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Limitler: {form.limits.students || "özel"} öğrenci / {form.limits.users || "özel"} kullanıcı / {form.limits.branches || "özel"} şube ·
              Modül: {form.includedModules.length} · Durum: {form.status === "active" ? "Aktif" : "Pasif"}
            </p>
          </div>
        </Card>
      ) : null}

      {renameAsk ? (
        <div role="alertdialog" aria-modal="true" aria-labelledby="pe-rename-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-[var(--radius-lg)] border p-5 shadow-[var(--shadow-md)]" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            <h2 id="pe-rename-title" className="text-base font-semibold">Paket anahtarı değişecek</h2>
            <p className="mt-2 text-sm">
              <strong>“{renameAsk.oldKey}”</strong>
              <span aria-hidden="true"> → </span>
              <strong>“{renameAsk.newKey}”</strong>
            </p>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Anahtar teknik kimliktir: eski anahtarla kaydedilmiş satın alma bağlantıları ve bu düzenleme adresi
              değişir. Bu anahtarı kullanan kurum/abonelik yok (sunucu kaydetmeden önce yeniden doğrular).
              Değişiklik taslağa yazılır; satışa yansıması için ayrıca yayın gerekir.
            </p>
            <label htmlFor="pe-rename-type" className="mt-3 block text-sm font-medium">
              Onaylamak için eski anahtarı yazın: <strong>“{renameAsk.oldKey}”</strong>
            </label>
            <Input
              id="pe-rename-type"
              value={renameType}
              disabled={busy}
              autoComplete="off"
              placeholder={renameAsk.oldKey}
              onChange={(e) => setRenameType(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => setRenameAsk(null)}>
                Vazgeç
              </Button>
              <Button
                variant="danger"
                disabled={busy || renameType.trim() !== renameAsk.oldKey}
                onClick={async () => {
                  const r = renameAsk;
                  setRenameAsk(null);
                  await doSave(r.newKey, true);
                }}
              >
                {busy ? "Kaydediliyor…" : "Anahtarı değiştir ve kaydet"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
