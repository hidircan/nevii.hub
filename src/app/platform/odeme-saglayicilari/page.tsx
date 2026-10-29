import { PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getDefaultProviderForNew, getSaasProvider } from "@/lib/saas-billing/provider-adapter";
import { hasCapability, type ProviderCapability } from "@/lib/saas-billing/providers";
import { getPaytrConfig } from "@/lib/saas-billing/paytr-subscription";
import { getIyzicoSubConfig } from "@/lib/saas-billing/iyzico-subscription";
import { isPlatformEncryptionConfigured } from "@/lib/platform/secrets";
import { CopyButton } from "./copy-button";

export const dynamic = "force-dynamic";

const CAPABILITY_LABELS: { key: ProviderCapability; label: string; detail: string }[] = [
  { key: "embed_checkout_html", label: "Gömülü checkout", detail: "Ödeme formu uygulama içinde açılır" },
  { key: "form_post_checkout", label: "Doğrudan kart gönderimi", detail: "Tarayıcı kartı doğrudan sağlayıcıya gönderir" },
  { key: "retrieve_by_token", label: "Sonuç sorgulama", detail: "Dönüş sonrası sunucudan sunucuya doğrulama" },
  { key: "status_query", label: "Durum sorgulama", detail: "Belirsiz işlemlerin uzlaştırılması" },
  { key: "server_charge", label: "Sunucu tarafı tahsilat", detail: "Vade gelince uygulamanın çekim başlatması" },
  { key: "provider_renewal", label: "Sağlayıcı yenilemesi", detail: "Yenilemeyi sağlayıcının zamanlaması" },
  { key: "card_update_form", label: "Kart güncelleme", detail: "Kayıtlı ödeme aracını yenileme" },
  { key: "remote_cancel", label: "Uzaktan iptal", detail: "Sağlayıcı tarafında aboneliği kapatma" },
];

function maskMerchant(account: string): string {
  const [prefix, id = ""] = account.split(":");
  if (prefix === "mock" || !id || id === "unconfigured") return account;
  if (id.length <= 4) return `${prefix}:••••`;
  return `${prefix}:${id.slice(0, 2)}••••${id.slice(-2)}`;
}

const PROVIDERS = [
  { id: "paytr" as const, name: "PayTR", note: "Hedef entegrasyon: Direct API + kart saklama + Non3D otomatik tahsilat." },
  { id: "iyzico" as const, name: "iyzico", note: "Alternatif: Abonelik ürünü. Otomatik yenileme sağlayıcıda koşar." },
  { id: "mock" as const, name: "Test ödemesi (deneme)", note: "Yalnız local/test. Gerçek tahsilat yapmaz; sonucu her zaman deneme diye etiketler." },
];

export default async function ProviderSettingsPage() {
  await requireHyperAdminPage("/platform/odeme-saglayicilari");
  const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
  const rawDefault = process.env.SAAS_BILLING_PROVIDER || "(tanımsız)";
  const effectiveDefault = getDefaultProviderForNew();
  const paytr = getPaytrConfig();
  const iyzico = getIyzicoSubConfig();
  const encryptionOn = isPlatformEncryptionConfigured();

  const PROVIDER_TR: Record<string, string> = { paytr: "PayTR", iyzico: "iyzico", mock: "Test ödemesi (deneme)", manual: "Banka transferi", none: "Seçilmedi" };
  const callbacks = [
    { label: "Ödeme dönüş adresi", url: `${baseUrl}/api/v1/billing/checkout/callback` },
    { label: "PayTR bildirim adresi", url: `${baseUrl}/api/v1/billing/callbacks/paytr` },
    { label: "iyzico bildirim adresi", url: `${baseUrl}/api/v1/billing/webhooks/iyzico` },
  ];

  return (
    <div>
      <PageHeader
        title="Ödeme Sağlayıcıları"
        description="Hangi sağlayıcıyla, hangi hesap ve yetkiyle tahsilat yapıldığı bu ekrandan izlenir. Bu ekrandan gizli anahtar yazılmaz; değerler terminal yoluyla tanımlanır."
      />

      <section className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Ortam ve varsayılan</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-[var(--color-text-muted)]">Varsayılan sağlayıcı ayarı</dt><dd className="font-medium text-[var(--color-text)]" title="SAAS_BILLING_PROVIDER">{PROVIDER_TR[rawDefault.toLowerCase()] ?? rawDefault}</dd></div>
          <div><dt className="text-[var(--color-text-muted)]">Yeni aboneliklerde etkin sağlayıcı</dt><dd className="font-medium text-[var(--color-text)]">{PROVIDER_TR[effectiveDefault] ?? effectiveDefault}</dd></div>
          <div><dt className="text-[var(--color-text-muted)]">Uygulama adresi</dt><dd className="font-medium text-[var(--color-text)]">{baseUrl}</dd></div>
          <div><dt className="text-[var(--color-text-muted)]">Gizli anahtar saklama</dt><dd className="font-medium text-[var(--color-text)]">{encryptionOn ? "Şifreli saklama anahtarı tanımlı" : "Anahtar yok: değerler yalnız ortam ayarlarından okunur"}</dd></div>
        </dl>
        <div className="mt-4 space-y-2">
          {callbacks.map((c) => (
            <div key={c.url} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-sm border border-[var(--color-border)]">
              <span><strong className="text-[var(--color-text)]">{c.label}:</strong> <code className="text-[var(--color-text)]">{c.url}</code></span>
              <CopyButton text={c.url} label={c.label} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
          Bilgisayarınızdaki test adresini (localhost) canlı bildirim hedefi yapmayın. Canlı adres, yayınlanan ortamın adresi olmalıdır.
        </p>
      </section>

      <div className="mt-6 space-y-6">
        {PROVIDERS.map((p) => {
          const provider = getSaasProvider(p.id);
          const configured = provider.isConfigured();
          const missing = provider.missingPreconditions();
          return (
            <section key={p.id} className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-[var(--color-text)]">{p.name}</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${configured ? "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]"}`}>
                  {configured ? "Yapılandırıldı" : "Eksik"}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{p.note}</p>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-[var(--color-text-muted)]">Mağaza hesabı</dt><dd className="font-medium text-[var(--color-text)]">{maskMerchant(provider.merchantAccount())}</dd></div>
                <div><dt className="text-[var(--color-text-muted)]">Yenileme modeli</dt><dd className="font-medium text-[var(--color-text)]">{provider.executionModel === "MERCHANT_SCHEDULED" ? "Uygulama zamanlar (kayıtlı karttan çeker)" : provider.executionModel === "PROVIDER_MANAGED" ? "Sağlayıcı zamanlar" : "—"}</dd></div>
                <div><dt className="text-[var(--color-text-muted)]">Test / canlı</dt><dd className="font-medium text-[var(--color-text)]">{p.id === "paytr" ? (paytr.testMode === "1" ? "Test kipi" : "Canlı kip") : p.id === "iyzico" ? (iyzico.baseUrl.includes("sandbox") ? "Deneme adresi" : "Canlı adres") : "Gerçek işlem yok"}</dd></div>
              </dl>
              {p.id === "paytr" ? (
                <div className="mt-3 rounded-lg bg-[var(--color-surface-muted)] p-3 text-sm border border-[var(--color-border)]">
                  <p className="font-semibold text-[var(--color-text)]">Hesap yetkileri (ayar işareti; gerçek yetki PayTR panelinde doğrulanır)</p>
                  <ul className="mt-1 space-y-1 text-[var(--color-text)]">
                    <li>İlk tahsilat: {paytr.capDirect ? "ayar açık" : "eksik"}</li>
                    <li>Kart saklama: {paytr.capCardStorage ? "ayar açık" : "eksik"}</li>
                    <li>Otomatik tahsilat: {paytr.capNon3d ? "ayar açık" : "eksik"}</li>
                  </ul>
                </div>
              ) : null}
              {missing.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-[var(--color-warning)]">
                  {missing.map((m) => (
                    <li key={m}>· {m}</li>
                  ))}
                </ul>
              ) : null}
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold text-[var(--color-text)]">Gelişmiş: yetenek matrisi</summary>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {CAPABILITY_LABELS.map((c) => (
                    <li key={c.key} className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 border border-[var(--color-border)]">
                      <span className={hasCapability(provider, c.key) ? "font-semibold text-[var(--color-success)]" : "text-[var(--color-text-muted)]"}>
                        {hasCapability(provider, c.key) ? "Destekleniyor" : "Desteklenmiyor"}
                      </span>
                      <span className="text-[var(--color-text)]"> · {c.label}</span>
                      <span className="block text-xs text-[var(--color-text-muted)]">{c.detail}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          );
        })}
      </div>

      <section className="mt-6 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Doğruluk notu</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
          Yapılandırıldı notu yalnız bu ortamın env işaretlerinin tam olduğunu söyler; sağlayıcının
          kendi panelindeki onayı veya gerçek test ödemesini kanıtlamaz. Gerçek doğrulama yapılmadı.
        </p>
        <a
          href="/platform/odeme-saglayicilari"
          className="mt-3 inline-block rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-5 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2"
        >
          Yapılandırmayı kontrol et
        </a>
      </section>

      <section className="mt-6 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="text-base font-semibold text-[var(--color-text)]">PayTR kurulum adımları</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-text)]">
          <li>PayTR Mağaza Paneli → Entegrasyon Bilgileri bölümünden merchant_id, merchant_key ve merchant_salt değerlerini alın.</li>
          <li>Kart saklama ve Non3D/otomatik tahsilat yetkilerini PayTR ile netleştirin; onaylanmadan env işaretlerini açmayın.</li>
          <li>Değerleri yalnız güvenli terminalden env olarak tanımlayın (örnek: <code>export PAYTR_MERCHANT_ID=...</code>). Bu ekrandan secret yazılmaz; boş bırakmak mevcut değeri silmez çünkü yazma yoktur.</li>
          <li>Uygulamayı yeniden başlatıp bu ekrandaki Yapılandırmayı kontrol et bağlantısı ile durumu görün; eksikler yukarıda listelenir.</li>
          <li>Gerçek tahsilattan önce PayTR test ortamında ilk ödeme + otomatik yenileme + iptal akışlarını ayrı onayla doğrulayın.</li>
        </ol>
      </section>
    </div>
  );
}
