"use client";

import { useEffect, useRef, useState } from "react";
import { BILLING_RECIPIENT_LABELS, BILLING_RECIPIENT_TYPES } from "@/lib/saas-billing/invoicing-profile";
import {
  clearCheckoutSession,
  ensureCheckoutKey,
  loadCheckoutSession,
  saveCheckoutSession,
  useCheckoutSession,
} from "@/components/billing/checkout-session";

export type OrderInfoInitial = {
  institutionName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  displayName: string;
  recipientType: string;
  legalTitle: string;
  taxId: string;
  nationalId: string;
  taxOffice: string;
  addressLine: string;
  district: string;
  city: string;
  country: string;
  invoiceEmail: string;
};

const EMPTY: OrderInfoInitial = {
  institutionName: "",
  ownerName: "",
  ownerEmail: "",
  ownerPhone: "",
  displayName: "",
  recipientType: "corporate",
  legalTitle: "",
  taxId: "",
  nationalId: "",
  taxOffice: "",
  addressLine: "",
  district: "",
  city: "",
  country: "Türkiye",
  invoiceEmail: "",
};

/**
 * Adım 2 birleşik form: kurum + yetkili + hesap e-postası + fatura bilgileri.
 * Parola İSTENMEZ. Kayıt gerçekten yazılır (idempotent); yalnız state'te tutulmaz.
 */
export function OrderInfoForm({
  planKey,
  interval,
  initial,
  editToken,
  onEmailTaken,
}: {
  planKey: string;
  interval: "monthly" | "yearly";
  initial?: Partial<OrderInfoInitial> | null;
  /** Düzenleme kipinde sipariş token'ı (e-posta değiştirilemez). */
  editToken?: string | null;
  onEmailTaken?: () => void;
}) {
  const [f, setF] = useState<OrderInfoInitial>({ ...EMPTY, ...(initial ?? {}) });
  // Sekme-sabit anahtar: geri/ileri/yenileme aynı anahtarı verir → sunucu
  // replay'i ikinci kayıt açmaz (BUG2). Render çıktısına girmez (SSR güvenli).
  const [key] = useState(() => ensureCheckoutKey(planKey, interval));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeEmail, setResumeEmail] = useState("");
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [resumeOffer, setResumeOffer] = useState(false);

  async function requestResume() {
    setResumeNotice(null);
    setResumeBusy(true);
    try {
      const res = await fetch("/api/v1/billing/orders/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resumeEmail }),
      });
      const json = (await res.json()) as { ok: boolean; data?: { message?: string }; error?: { message?: string } };
      setResumeBusy(false);
      setResumeNotice(
        json.ok ? (json.data?.message ?? "İstek alındı.") : (json.error?.message ?? "İstek alınamadı.")
      );
    } catch {
      setResumeBusy(false);
      setResumeNotice("Sunucuya ulaşılamadı.");
    }
  }
  // Sekme oturumu (haricî kaynak aboneliği — hidrasyon uyumlu).
  const session = useCheckoutSession();
  const resumeToken = !editToken ? (session?.token ?? null) : null;
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Gönderim öncesi taslak (BUG1): render sırasında tek seferlik uyarlama
  // (onaylı desen; effect içinde sync setState yasak).
  const [draftApplied, setDraftApplied] = useState(Boolean(editToken));
  if (!editToken && !draftApplied && session?.draft) {
    setDraftApplied(true);
    const d = session.draft;
    setF((v) => ({ ...v, ...d }));
  }

  // Taslak yazımı (400ms debounce; sekme ömrü, URL'ye hassas veri yok).
  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveCheckoutSession({ key, planKey, interval, draft: { ...f } });
    }, 400);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [f, key, planKey, interval]);
  const input =
    "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/20";
  const label = "mb-1 block text-sm font-medium text-slate-700";
  const req = (
    <span aria-hidden className="text-amber-700">
      {" "}
      *
    </span>
  );
  const opt = <span className="font-normal text-slate-500"> (isteğe bağlı)</span>;
  const individual = f.recipientType === "individual";
  const set = (k: keyof OrderInfoInitial) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const isEdit = Boolean(editToken);
      const res = await fetch("/api/v1/billing/orders", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? {
                t: editToken,
                institutionName: f.institutionName,
                ownerName: f.ownerName,
                ownerPhone: f.ownerPhone || null,
                billing: {
                  displayName: f.displayName || f.institutionName,
                  recipientType: f.recipientType,
                  legalTitle: f.legalTitle,
                  taxId: f.taxId || null,
                  nationalId: f.nationalId || null,
                  taxOffice: f.taxOffice || null,
                  addressLine: f.addressLine,
                  district: f.district || null,
                  city: f.city,
                  country: f.country,
                  invoiceEmail: f.invoiceEmail,
                },
              }
            : {
                planKey,
                interval,
                institutionName: f.institutionName,
                ownerName: f.ownerName,
                ownerEmail: f.ownerEmail,
                ownerPhone: f.ownerPhone || null,
                idempotencyKey: key,
                billing: {
                  displayName: f.displayName || f.institutionName,
                  recipientType: f.recipientType,
                  legalTitle: f.legalTitle,
                  taxId: f.taxId || null,
                  nationalId: f.nationalId || null,
                  taxOffice: f.taxOffice || null,
                  addressLine: f.addressLine,
                  district: f.district || null,
                  city: f.city,
                  country: f.country,
                  invoiceEmail: f.invoiceEmail,
                },
              }
        ),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { token?: string; orderId?: string };
        error?: { code?: string; message?: string };
      };
      if (!json.ok) {
        setBusy(false);
        if (json.error?.code === "EMAIL_TAKEN") {
          onEmailTaken?.();
          setError("Bu e-posta ile kayıtlı bir hesap var. Aşağıdaki mevcut müşteri girişini kullanın.");
          return;
        }
        if (json.error?.code === "PENDING_EXISTS") {
          // BUG2: kendi bekleyen kaydı — sekmedeki token ile sürdür (e-posta
          // tek başına yetki değildir; token sahipliği kanıtlar).
          const mine = loadCheckoutSession()?.token ?? null;
          if (mine) {
            window.location.href = `/satin-al/bilgiler?t=${encodeURIComponent(mine)}`;
            return;
          }
          setError("Bu e-posta ile bekleyen bir kaydınız var. Kaydı oluşturduğunuz sekmeden devam edin.");
          setResumeOffer(true);
          return;
        }
        setError(json.error?.message ?? "Kayıt oluşturulamadı.");
        return;
      }
      if (isEdit) {
        window.location.href = `/satin-al/onizleme?t=${encodeURIComponent(editToken ?? "")}`;
      } else if (json.data?.token) {
        // Token benimsenir (tek kaynak: sunucu yanıtı); taslak temizlenir.
        saveCheckoutSession({ key, planKey, interval, token: json.data.token, draft: null });
        window.location.href = `/satin-al/onizleme?t=${encodeURIComponent(json.data.token)}`;
      } else {
        setBusy(false);
        setError("Kayıt oluştu ancak devam bağlantısı alınamadı. Sayfayı yenileyip tekrar deneyin.");
      }
    } catch {
      setBusy(false);
      setError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {resumeToken && !editToken ? (
        <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">Devam eden kaydınız var.</p>
          <p className="mt-1 text-amber-800">
            Ödeme bekleyen kaydınıza kaldığınız yerden devam edebilir veya yeni bir kayıt başlatabilirsiniz.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`/satin-al/bilgiler?t=${encodeURIComponent(resumeToken)}`}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Kaydıma devam et
            </a>
            <button
              type="button"
              onClick={() => {
                // Oturum silinir ve sayfa baştan açılır: yeni idempotency
                // anahtarı üretilir, eski kayda bağlanılmaz.
                clearCheckoutSession();
                window.location.reload();
              }}
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              Yeni kayıt başlat
            </button>
          </div>
        </div>
      ) : null}
      <fieldset>
        <legend className="mb-3 text-base font-semibold">Kurum ve yetkili</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="oi-institution" className={label}>Kurum adı{req}</label>
            <input id="oi-institution" required minLength={2} maxLength={120} autoComplete="organization" value={f.institutionName} onChange={set("institutionName")} className={input} />
          </div>
          <div>
            <label htmlFor="oi-owner" className={label}>Yetkili adı soyadı{req}</label>
            <input id="oi-owner" required minLength={2} maxLength={120} autoComplete="name" value={f.ownerName} onChange={set("ownerName")} className={input} />
          </div>
          <div>
            <label htmlFor="oi-email" className={label}>Hesap e-postası{req}</label>
            <input
              id="oi-email"
              required={!editToken}
              disabled={Boolean(editToken)}
              type="email"
              maxLength={160}
              autoComplete="email"
              value={f.ownerEmail}
              onChange={set("ownerEmail")}
              className={`${input} disabled:bg-slate-100 disabled:text-slate-500`}
            />
            <p className="mt-1 text-xs text-slate-500">
              {editToken ? "Hesap e-postası değiştirilemez." : "Kurulum bağlantısı ve fatura bildirimi bu adrese gider."}
            </p>
          </div>
          <div>
            <label htmlFor="oi-phone" className={label}>Telefon{opt}</label>
            <input id="oi-phone" type="tel" maxLength={20} autoComplete="tel" value={f.ownerPhone} onChange={set("ownerPhone")} className={input} />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-base font-semibold">Fatura bilgileri</legend>
        <p className="mb-3 text-xs text-slate-500">Belgelerinizdeki alıcı bilgileri. Bu adımda ödeme alınmaz.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="oi-display" className={label}>Kurum görünen adı{opt}</label>
            <input id="oi-display" maxLength={120} value={f.displayName} onChange={set("displayName")} placeholder={f.institutionName || "Kurum adıyla aynı"} className={input} />
          </div>
          <div>
            <label htmlFor="oi-type" className={label}>Alıcı türü{req}</label>
            <select id="oi-type" value={f.recipientType} onChange={set("recipientType")} className={input}>
              {BILLING_RECIPIENT_TYPES.map((t) => (
                <option key={t} value={t}>{BILLING_RECIPIENT_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="oi-legal" className={label}>{individual ? "Ad soyad (faturadaki)" : "Resmî ticaret unvanı"}{req}</label>
            <input id="oi-legal" required minLength={2} maxLength={200} value={f.legalTitle} onChange={set("legalTitle")} className={input} />
            {!individual ? <p className="mt-1 text-xs text-slate-500">Vergi levhasındaki unvanla aynı yazın.</p> : null}
          </div>
          <div>
            <label htmlFor="oi-taxid" className={label}>Vergi kimlik no (VKN){!individual ? req : opt}</label>
            <input id="oi-taxid" inputMode="numeric" maxLength={20} value={f.taxId} onChange={set("taxId")} placeholder="10 hane" className={input} />
          </div>
          <div>
            <label htmlFor="oi-national" className={label}>T.C. kimlik no{individual ? req : opt}</label>
            <input id="oi-national" inputMode="numeric" maxLength={20} value={f.nationalId} onChange={set("nationalId")} placeholder="11 hane" className={input} />
          </div>
          <div>
            <label htmlFor="oi-taxoffice" className={label}>Vergi dairesi{opt}</label>
            <input id="oi-taxoffice" maxLength={100} value={f.taxOffice} onChange={set("taxOffice")} className={input} />
          </div>
          <div>
            <label htmlFor="oi-invemail" className={label}>Fatura e-postası{req}</label>
            <input id="oi-invemail" required type="email" maxLength={150} value={f.invoiceEmail} onChange={set("invoiceEmail")} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="oi-address" className={label}>Fatura adresi{req}</label>
            <input id="oi-address" required minLength={5} maxLength={300} autoComplete="street-address" value={f.addressLine} onChange={set("addressLine")} className={input} />
          </div>
          <div>
            <label htmlFor="oi-district" className={label}>İlçe{opt}</label>
            <input id="oi-district" maxLength={100} value={f.district} onChange={set("district")} className={input} />
          </div>
          <div>
            <label htmlFor="oi-city" className={label}>İl{req}</label>
            <input id="oi-city" required minLength={2} maxLength={100} value={f.city} onChange={set("city")} className={input} />
          </div>
        </div>
      </fieldset>

      {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
      {resumeOffer && !editToken ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">Bağlantınızı mı kaybettiniz?</p>
          <p className="mt-1 text-xs text-slate-600">
            Kayıttaki e-posta adresinize yeni bir devam bağlantısı gönderebiliriz.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={resumeEmail}
              onChange={(e) => setResumeEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void requestResume();
                }
              }}
              placeholder="Kayıttaki e-posta"
              aria-label="Kayıttaki e-posta"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
            <button
              type="button"
              onClick={() => void requestResume()}
              disabled={resumeBusy || !resumeEmail.trim()}
              className="shrink-0 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {resumeBusy ? "Gönderiliyor…" : "Bağlantıyı gönder"}
            </button>
          </div>
          {resumeNotice ? <p role="status" className="mt-2 text-xs text-slate-600">{resumeNotice}</p> : null}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-amber-600 px-5 py-3.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {busy ? "Kaydediliyor…" : editToken ? "Değişiklikleri kaydet ve önizlemeye dön" : "Kaydı oluştur ve devam et"}
      </button>
      {!editToken ? (
        <p className="text-xs leading-relaxed text-slate-500">
          Kayıt “ödeme bekliyor” durumundadır; ödeme doğrulanmadan ürün kullanımı açılmaz ve parola istenmez.
        </p>
      ) : null}
    </form>
  );
}
