"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SellerView = {
  legalTitle: string;
  taxId: string | null;
  taxOffice: string | null;
  addressLine: string | null;
  city: string | null;
  country: string;
  invoiceEmail: string;
  verified: boolean;
  mersisNo?: string | null;
  kepAddress?: string | null;
  phone?: string | null;
};

const SOURCE_TR: Record<string, string> = { kayitli: "kayıtlı profil", env: "sunucu ayarı", eksik: "eksik" };

/**
 * Satıcı / Şirket Bilgileri düzenleme (HYPER_ADMIN). Bu bilgiler secret
 * değildir (faturada görünür); ödeme/entegratör sırları bu forma girilmez.
 */
export function SellerProfileEditor({
  seller,
  sources,
}: {
  seller: SellerView;
  sources: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const start = {
    legalTitle: seller.legalTitle.startsWith("[DOĞRULANACAK") ? "" : seller.legalTitle,
    taxId: seller.taxId ?? "",
    taxOffice: seller.taxOffice ?? "",
    addressLine: seller.addressLine ?? "",
    city: seller.city ?? "",
    country: seller.country,
    invoiceEmail: seller.invoiceEmail,
    mersisNo: seller.mersisNo ?? "",
    kepAddress: seller.kepAddress ?? "",
    phone: seller.phone ?? "",
  };
  const [form, setForm] = useState(start);
  const dirty = JSON.stringify(form) !== JSON.stringify(start);

  useEffect(() => {
    if (!dirty || busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, busy]);

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/platform/billing/seller-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message?: string } };
      setBusy(false);
      if (!json.ok) {
        setNotice({ kind: "error", text: json.error?.message ?? "Kaydedilemedi." });
        return;
      }
      setNotice({ kind: "ok", text: "Satıcı bilgileri kaydedildi. Yeni belgeler bu kaydı kullanır; eski belgeler değişmez." });
      router.refresh();
    } catch {
      setBusy(false);
      setNotice({ kind: "error", text: "Bağlantı hatası." });
    }
  }

  const input = "w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";
  const inputLabel = "mb-1 block text-xs font-medium text-[var(--color-text-muted)]";
  const missing = [
    seller.taxId ? null : "vergi kimlik numarası",
    seller.taxOffice ? null : "vergi dairesi",
    seller.addressLine ? null : "adres",
    seller.city ? null : "il",
  ].filter((x): x is string => Boolean(x));

  const row = (label: string, value: string | null, sourceKey: string) => (
    <div className="flex justify-between gap-2">
      <dt className="text-[var(--color-text-muted)]">
        {label}{" "}
        <span className="text-[11px]">({SOURCE_TR[sources[sourceKey]] ?? sources[sourceKey]})</span>
      </dt>
      <dd className="font-medium">{value || "eksik"}</dd>
    </div>
  );

  return (
    <section aria-label="Satıcı bilgileri" className="mb-6 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Satıcı bilgileri (belgelerdeki NeviiHub kaydı)</h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
        >
          {open ? "Kapat" : "Düzenle"}
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        Alıcı bilgileri kurumların fatura profilinden gelir ve satıcıyla karıştırılmaz. Kaynak önceliği:
        kayıtlı profil, yoksa sunucu ayarı (SAAS_SELLER_*).
      </p>
      {notice ? (
        <p role={notice.kind === "error" ? "alert" : "status"} className={`mt-3 rounded-[var(--radius-md)] px-4 py-2.5 text-sm border ${notice.kind === "error" ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]" : "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]"}`}>
          {notice.text}
        </p>
      ) : null}
      {!open ? (
        <>
          <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {row("Ticaret unvanı", seller.legalTitle, "legalTitle")}
            {row("Vergi kimlik no", seller.taxId, "taxId")}
            {row("Vergi dairesi", seller.taxOffice, "taxOffice")}
            {row("Adres", [seller.addressLine, seller.city].filter(Boolean).join(", ") || null, "addressLine")}
            {row("Fatura e-postası", seller.invoiceEmail, "invoiceEmail")}
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--color-text-muted)]">Doğrulama</dt>
              <dd className="font-medium">{seller.verified ? "Tamam" : "Eksik bilgi var — resmî belge düzenlenemez"}</dd>
            </div>
          </dl>
          {missing.length > 0 ? (
            <p className="mt-2 text-xs text-[var(--color-warning)]">Eksikler: {missing.join("; ")}. Gerçek belge için mali müşavir onayı gerekir.</p>
          ) : null}
        </>
      ) : (
        <div className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={inputLabel} htmlFor="seller-title">Ticaret unvanı (zorunlu)</label>
              <input id="seller-title" value={form.legalTitle} onChange={(e) => setForm({ ...form, legalTitle: e.target.value })} className={input} />
            </div>
            <div>
              <label className={inputLabel} htmlFor="seller-taxid">Vergi no (şirket VKN 10 hane / şahıs işletmesi T.C. kimlik no 11 hane)</label>
              <input id="seller-taxid" inputMode="numeric" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} className={input} />
            </div>
            <div>
              <label className={inputLabel} htmlFor="seller-office">Vergi dairesi</label>
              <input id="seller-office" value={form.taxOffice} onChange={(e) => setForm({ ...form, taxOffice: e.target.value })} className={input} />
            </div>
            <div>
              <label className={inputLabel} htmlFor="seller-mail">Fatura e-postası (zorunlu)</label>
              <input id="seller-mail" type="email" value={form.invoiceEmail} onChange={(e) => setForm({ ...form, invoiceEmail: e.target.value })} className={input} />
            </div>
            <div className="sm:col-span-2">
              <label className={inputLabel} htmlFor="seller-addr">Adres</label>
              <input id="seller-addr" value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} className={input} />
            </div>
            <div>
              <label className={inputLabel} htmlFor="seller-city">İl</label>
              <input id="seller-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={input} />
            </div>
            <div>
              <label className={inputLabel} htmlFor="seller-country">Ülke</label>
              <input id="seller-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className={input} />
            </div>
            <div>
              <label className={inputLabel} htmlFor="seller-mersis">MERSİS no (şirketler)</label>
              <input id="seller-mersis" inputMode="numeric" value={form.mersisNo} onChange={(e) => setForm({ ...form, mersisNo: e.target.value })} className={input} />
            </div>
            <div>
              <label className={inputLabel} htmlFor="seller-kep">KEP adresi</label>
              <input id="seller-kep" value={form.kepAddress} onChange={(e) => setForm({ ...form, kepAddress: e.target.value })} className={input} />
            </div>
            <div>
              <label className={inputLabel} htmlFor="seller-phone">Destek telefonu</label>
              <input id="seller-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} />
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Bu bilgiler sözleşme, KVKK ve ön bilgilendirme metinlerindeki satıcı kimliğine otomatik yerleşir.
          </p>
          {dirty && !busy ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">Kaydedilmemiş değişiklik var; sayfadan ayrılırsanız kaybolur.</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !dirty}
              onClick={save}
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setForm(start);
                setOpen(false);
              }}
              className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-60"
            >
              Vazgeç
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Bu kayıt yeni belgelerde kullanılır; eski belge satıcı kayıtları değişmez. Kayıt veritabanında
            kalıcıdır; SAAS_SELLER_* sunucu ayarları yalnız boş alanlar için yedek değerdir.
          </p>
        </div>
      )}
    </section>
  );
}
