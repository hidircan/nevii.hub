import Link from "@/components/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getPlanNameMap } from "@/lib/platform/commercial-catalog";
import { planLabel } from "@/lib/platform/entitlements";
import {
  getSaasPendingOrder,
  getSaasPurchaseRequest,
  getSaasQuoteRequest,
  getSaasTrialRequest,
} from "@/lib/saas-billing/store";
import { BILLING_RECIPIENT_LABELS } from "@/lib/saas-billing/invoicing-profile";
import { formatMinorTR, type SaasPriceSnapshot } from "@/lib/saas-billing/types";
import type { SaasPendingOrderRecord } from "@/lib/saas-billing/types";

export const dynamic = "force-dynamic";

const KINDS = {
  "satin-alma": "Satın alma başvurusu",
  deneme: "Deneme başvurusu",
  teklif: "Teklif isteği",
  taslak: "Satın alma taslağı",
} as const;
type Kind = keyof typeof KINDS;

const REQUEST_STATUS_TR: Record<string, string> = {
  pending: "Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  contacted: "İletişime geçildi",
  converted: "Dönüştü",
  closed: "Kapatıldı",
};

const PENDING_STATUS_TR: Record<string, string> = {
  awaiting_payment: "Ödeme bekliyor",
  paid: "Ödendi",
  expired: "Süresi doldu",
  canceled: "İptal edildi",
};

const MAIL_TR: Record<string, string> = {
  sent: "Gönderildi",
  blocked: "Engellendi (güvenlik)",
  failed: "Başarısız",
  skipped_same_address: "Tek iletide birleştirildi",
};

const fmtDateTime = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-3">
      <dt className="w-44 shrink-0 text-xs text-[var(--color-text-muted)]">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const blank = <span className="text-[var(--color-text-muted)]">—</span>;
const linkCls = "text-[var(--color-primary)] hover:underline";

function PriceSection({ snapshot }: { snapshot: SaasPriceSnapshot }) {
  const cur = snapshot.currency;
  return (
    <Card>
      <h2 className="text-sm font-semibold">Fiyat ve ödeme</h2>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        Ödeme adımında dondurulan tutar; katalog değişse bile bu kayıt için değişmez.
      </p>
      <dl className="mt-2 divide-y divide-[var(--color-border)]">
        <Row label="Paket">{snapshot.planLabel}</Row>
        <Row label="Dönem">{snapshot.billingInterval === "yearly" ? "Yıllık" : "Aylık"}</Row>
        <Row label="Liste bedeli (KDV hariç)">{formatMinorTR(snapshot.amountMinor, cur)}</Row>
        <Row label="KDV">
          {snapshot.taxAmountMinor != null
            ? `${formatMinorTR(snapshot.taxAmountMinor, cur)}${snapshot.taxRateBps != null ? ` (%${snapshot.taxRateBps / 100})` : ""}`
            : blank}
        </Row>
        <Row label="Karttan çekilen toplam">
          {snapshot.totalWithTaxMinor != null ? formatMinorTR(snapshot.totalWithTaxMinor, cur) : blank}
        </Row>
        {snapshot.monthlyEquivalentMinor != null ? (
          <Row label="Aylık eşdeğer (bilgi)">{formatMinorTR(snapshot.monthlyEquivalentMinor, cur)}</Row>
        ) : null}
        <Row label="Kampanya">{snapshot.campaignNote ?? "Yok"}</Row>
        {snapshot.campaignNote ? <Row label="Kampanya sonrası">{snapshot.postCampaignNote ?? blank}</Row> : null}
        <Row label="Yenileme koşulu">{snapshot.renewalNote}</Row>
        <Row label="Kabul zamanı">{fmtDateTime(snapshot.acceptedAt)}</Row>
        {snapshot.sandbox || snapshot.taxDemo ? (
          <Row label="Uyarı">
            <span className="text-[var(--color-warning)]">
              {snapshot.sandbox ? "Sandbox (örnek) tutar. " : ""}
              {snapshot.taxDemo ? "Örnek vergi hesabı — oran doğrulanmadı." : ""}
            </span>
          </Row>
        ) : null}
      </dl>
    </Card>
  );
}

function OrderDetail({ order, planName }: { order: SaasPendingOrderRecord; planName: string }) {
  const b = order.billing;
  return (
    <>
      <Card>
        <h2 className="text-sm font-semibold">Fatura bilgileri</h2>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">Müşterinin ödeme öncesi verdiği alıcı bilgileri.</p>
        <dl className="mt-2 divide-y divide-[var(--color-border)]">
          <Row label="Alıcı türü">{BILLING_RECIPIENT_LABELS[b.recipientType] ?? b.recipientType}</Row>
          <Row label="Resmî unvan / ad soyad">{b.legalTitle}</Row>
          <Row label="VKN">{b.taxId ?? blank}</Row>
          <Row label="TCKN">{b.nationalId ?? blank}</Row>
          <Row label="Vergi dairesi">{b.taxOffice ?? blank}</Row>
          <Row label="Adres">
            {b.addressLine}
            {b.district ? `, ${b.district}` : ""} / {b.city} / {b.country}
          </Row>
          <Row label="Fatura e-postası">
            <a className={linkCls} href={`mailto:${b.invoiceEmail}`}>{b.invoiceEmail}</a>
          </Row>
          <Row label="İlgili kişi">{b.contactName ?? blank}</Row>
          <Row label="İlgili telefon">
            {b.contactPhone ? (
              <a className={linkCls} href={`tel:${b.contactPhone.replace(/\s+/g, "")}`}>{b.contactPhone}</a>
            ) : (
              blank
            )}
          </Row>
        </dl>
      </Card>

      {order.priceSnapshot ? (
        <PriceSection snapshot={order.priceSnapshot} />
      ) : (
        <Card>
          <h2 className="text-sm font-semibold">Fiyat ve ödeme</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Henüz ödeme adımı açılmamış — tutar dondurulmadı. Seçim: {planName} (
            {order.interval === "yearly" ? "yıllık" : "aylık"}).
          </p>
        </Card>
      )}

      <Card>
        <h2 className="text-sm font-semibold">Sözleşme kabulleri</h2>
        {order.consents ? (
          <dl className="mt-2 divide-y divide-[var(--color-border)]">
            <Row label="Koşul kabulü">{fmtDateTime(order.consents.termsAt)}</Row>
            <Row label="Otomatik tahsilat yetkisi">{fmtDateTime(order.consents.recurringAt)}</Row>
            <Row label="Ticari ileti izni">
              {order.consents.marketingAt ? fmtDateTime(order.consents.marketingAt) : "Verilmedi"}
            </Row>
            <Row label="Ödeme sağlayıcısı">{order.consents.providerDisplayName}</Row>
            <Row label="Kabul edilen belgeler">
              {Object.entries(order.consents.docVersions).length === 0
                ? blank
                : Object.entries(order.consents.docVersions).map(([doc, v]) => (
                    <span key={doc} className="mr-2 inline-block rounded bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs">
                      {doc}: {v}
                    </span>
                  ))}
            </Row>
          </dl>
        ) : (
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Henüz sözleşme kabulü yok.</p>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold">Süreç</h2>
        <dl className="mt-2 divide-y divide-[var(--color-border)]">
          <Row label="Aşama">{PENDING_STATUS_TR[order.status] ?? order.status}</Row>
          <Row label="Bağlı abonelik">
            {order.subscriptionId ? (
              <Link className={linkCls} href="/platform/fatura">
                Abonelikler ekranında aç
              </Link>
            ) : (
              blank
            )}
          </Row>
          <Row label="Oluşturma">{fmtDateTime(order.createdAt)}</Row>
          <Row label="Son işlem">{fmtDateTime(order.updatedAt)}</Row>
          <Row label="Ödeme penceresi sonu">{fmtDateTime(order.expiresAt)}</Row>
          <Row label="Hesap e-postası durumu">
            {order.mailStatus?.account
              ? `${MAIL_TR[order.mailStatus.account.state] ?? order.mailStatus.account.state} — ${order.mailStatus.account.reason} (${fmtDateTime(order.mailStatus.account.at)})`
              : blank}
          </Row>
          <Row label="Fatura e-postası durumu">
            {order.mailStatus?.invoice
              ? `${MAIL_TR[order.mailStatus.invoice.state] ?? order.mailStatus.invoice.state} — ${order.mailStatus.invoice.reason} (${fmtDateTime(order.mailStatus.invoice.at)})`
              : blank}
          </Row>
        </dl>
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-[var(--color-text-muted)] hover:underline">Teknik ayrıntı</summary>
          <p className="mt-1 font-mono text-[11px] text-[var(--color-text-muted)]">Kayıt: {order.id}</p>
          <p className="font-mono text-[11px] text-[var(--color-text-muted)]">Ayrılmış kurum kodu: {order.tenantId}</p>
        </details>
      </Card>
    </>
  );
}

export default async function BillingRequestDetailPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  await requireHyperAdminPage("/platform/basvurular");
  const { kind, id } = await params;
  if (!(kind in KINDS)) {
    return <EmptyState title="Bulunamadı" description="Geçersiz başvuru türü." />;
  }
  const k = kind as Kind;
  const rec =
    k === "taslak"
      ? await getSaasPendingOrder(id)
      : k === "satin-alma"
        ? await getSaasPurchaseRequest(id)
        : k === "deneme"
          ? await getSaasTrialRequest(id)
          : await getSaasQuoteRequest(id);
  if (!rec) {
    return <EmptyState title="Kayıt bulunamadı" description="Bu başvuru kayıtlı değil veya kaldırılmış." />;
  }
  const planNames = await getPlanNameMap();
  const nameOf = (key: string | null) => (key ? (planNames.get(key) ?? planLabel(key)) : null);

  return (
    <div className="space-y-4">
      <Link className={`${linkCls} text-sm`} href="/platform/basvurular">
        ← Başvurulara dön
      </Link>
      <PageHeader title={`${KINDS[k]} — ${rec.institutionName}`} description="Yalnız platform yöneticisi görür." />

      <Card>
        <h2 className="text-sm font-semibold">İletişim</h2>
        <dl className="mt-2 divide-y divide-[var(--color-border)]">
          <Row label="Kurum">{rec.institutionName}</Row>
          <Row label="Yetkili">{rec.ownerName}</Row>
          <Row label="E-posta">
            <a className={linkCls} href={`mailto:${rec.ownerEmail}`}>{rec.ownerEmail}</a>
          </Row>
          <Row label="Telefon">
            {rec.ownerPhone ? (
              <a className={linkCls} href={`tel:${rec.ownerPhone.replace(/\s+/g, "")}`}>{rec.ownerPhone}</a>
            ) : (
              <span className="text-[var(--color-text-muted)]">Verilmedi</span>
            )}
          </Row>
        </dl>
      </Card>

      {k === "taslak" ? (
        <OrderDetail
          order={rec as SaasPendingOrderRecord}
          planName={nameOf((rec as SaasPendingOrderRecord).planKey) ?? (rec as SaasPendingOrderRecord).planKey}
        />
      ) : (
        <>
          <Card>
            <h2 className="text-sm font-semibold">Başvuru</h2>
            <dl className="mt-2 divide-y divide-[var(--color-border)]">
              <Row label="Durum">{REQUEST_STATUS_TR[rec.status] ?? rec.status}</Row>
              {"planKey" in rec && rec.planKey ? (
                <Row label="Seçtiği paket">
                  {nameOf(rec.planKey)}
                  {"interval" in rec ? ` (${rec.interval === "yearly" ? "yıllık" : "aylık"})` : ""}
                </Row>
              ) : null}
              {"note" in rec && rec.note ? <Row label="Not">{rec.note}</Row> : null}
              <Row label="Oluşturma">{fmtDateTime(rec.createdAt)}</Row>
              {"decidedAt" in rec && rec.decidedAt ? (
                <Row label="Karar">{`${REQUEST_STATUS_TR[rec.status] ?? rec.status} — ${fmtDateTime(rec.decidedAt)}`}</Row>
              ) : null}
            </dl>
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-[var(--color-text-muted)] hover:underline">Teknik ayrıntı</summary>
              <p className="mt-1 font-mono text-[11px] text-[var(--color-text-muted)]">Kayıt: {rec.id}</p>
              {"tenantId" in rec && rec.tenantId ? (
                <p className="font-mono text-[11px] text-[var(--color-text-muted)]">Bağlı kurum kodu: {rec.tenantId}</p>
              ) : null}
            </details>
          </Card>
        </>
      )}
    </div>
  );
}
