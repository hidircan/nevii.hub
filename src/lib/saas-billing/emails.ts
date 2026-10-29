/**
 * SaaS billing e-postaları — doğrulanmış info@neviihub.com gönderen adresiyle.
 *
 * Kurallar:
 * - Gönderim mevcut `sendEmail` transportundan yapılır; yapılandırılmamışsa
 *   ASLA sahte başarı dönülmez (console transport `blocked:true` verir).
 * - Test koruması: `SAAS_EMAIL_LIVE=true` olmadan yalnızca izin listesindeki
 *   adreslere gönderilir; gerçek müşterilere test e-postası GİDEMEZ.
 * - Sağlayıcı dekontu ≠ vergi faturası: e-postalar "ödeme bildirimi/dekont
 *   bilgisi" dilini kullanır; e-fatura/e-arşiv entegrasyonu yokken "fatura
 *   kesildi" denmez.
 * - Otomatik yenileme/iptal, vergi ve KVKK metinleri HUKUKİ İNCELEME
 *   BEKLEYEN TASLAK olarak işaretlenir.
 */
import { sendEmail } from "../email";
import { formatMinorTR } from "./types";

export const SAAS_LEGAL_DRAFT_NOTE =
  "TASLAK — hukuki inceleme bekliyor. Bu metin nihai sözleşme koşulu değildir.";

function isLiveEmail(): boolean {
  return (process.env.SAAS_EMAIL_LIVE || "").toLowerCase() === "true";
}

function allowlist(): string[] {
  return (process.env.SAAS_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export type SaasEmailResult =
  | { sent: true; messageId?: string }
  | { sent: false; reason: string };

async function sendSaasEmail(args: {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}): Promise<SaasEmailResult> {
  const to = args.to.trim().toLowerCase();
  if (!isLiveEmail() && !allowlist().includes(to)) {
    return { sent: false, reason: "TEST_MODE_BLOCKED (alıcı izin listesinde değil)" };
  }
  const res = await sendEmail({
    to: args.to,
    subject: args.subject,
    html: args.htmlBody,
    text: args.textBody,
  });
  if (res.delivered) return { sent: true, messageId: res.messageId };
  return { sent: false, reason: res.reason };
}

const layout = (title: string, bodyHtml: string) => `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;color:#111">
<h2>${title}</h2>
${bodyHtml}
<hr><p style="font-size:12px;color:#666">NeviiHub SaaS abonelik bildirimi. ${SAAS_LEGAL_DRAFT_NOTE}</p>
</body></html>`;

export async function sendTrialReminderEmail(args: {
  to: string;
  planLabel: string;
  trialEndsAt: string;
  daysLeft: number;
}): Promise<SaasEmailResult> {
  const end = new Date(args.trialEndsAt).toLocaleDateString("tr-TR");
  return sendSaasEmail({
    to: args.to,
    subject: `NeviiHub denemeniz ${args.daysLeft} gün sonra bitiyor`,
    htmlBody: layout(
      "Deneme süreniz bitiyor",
      `<p><strong>${args.planLabel}</strong> denemeniz <strong>${end}</strong> tarihinde sona erecek.</p>
<p>Kesintisiz devam için ödeme yönteminizi ekleyin. Deneme bitiminde otomatik ücretlendirme yapılmaz; siz onaylamadan kartınızdan çekim olmaz.</p>`
    ),
    textBody: `${args.planLabel} denemeniz ${end} tarihinde bitiyor (${args.daysLeft} gün kaldı). Otomatik ücretlendirme yapılmaz.`,
  });
}

export async function sendPaymentFailedEmail(args: {
  to: string;
  amountMinor: number;
  updateCardUrl: string;
}): Promise<SaasEmailResult> {
  const amount = formatMinorTR(args.amountMinor);
  return sendSaasEmail({
    to: args.to,
    subject: "NeviiHub abonelik ödemeniz alınamadı",
    htmlBody: layout(
      "Ödeme alınamadı",
      `<p><strong>${amount}</strong> tutarındaki abonelik ödemeniz alınamadı.</p>
<p>Erişiminizin kısıtlanmaması için lütfen <a href="${args.updateCardUrl}">kart bilgilerinizi güncelleyin</a> veya borcunuzu ödeyin.</p>`
    ),
    textBody: `${amount} abonelik ödemeniz alınamadı. Kartınızı güncelleyin: ${args.updateCardUrl}`,
  });
}

export async function sendSuspensionEmail(args: {
  to: string;
  resumeUrl: string;
}): Promise<SaasEmailResult> {
  return sendSaasEmail({
    to: args.to,
    subject: "NeviiHub kurum aboneliğiniz kısıtlandı",
    htmlBody: layout(
      "Abonelik kısıtlandı",
      `<p>Ödemesi doğrulanamayan aboneliğiniz nedeniyle kurumunuzun işlevsel erişimi kısıtlandı. Verileriniz silinmedi.</p>
<p><a href="${args.resumeUrl}">Ödemeyi tamamlayarak</a> erişimi hemen geri alabilirsiniz.</p>`
    ),
    textBody: `Kurum aboneliğiniz kısıtlandı. Ödemeyi tamamlayarak erişimi geri alın: ${args.resumeUrl}`,
  });
}

export async function sendRenewalReceiptEmail(args: {
  to: string;
  amountMinor: number;
  periodEnd: string;
  providerRef: string;
}): Promise<SaasEmailResult> {
  const amount = formatMinorTR(args.amountMinor);
  const end = new Date(args.periodEnd).toLocaleDateString("tr-TR");
  return sendSaasEmail({
    to: args.to,
    subject: "NeviiHub abonelik ödeme bildirimi",
    htmlBody: layout(
      "Ödeme bildirimi (dekont bilgisi)",
      `<p><strong>${amount}</strong> abonelik ödemeniz alındı. Kullanım hakkınız <strong>${end}</strong> tarihine kadar geçerlidir.</p>
<p>Sağlayıcı referansı: ${args.providerRef}</p>
<p><em>Bu e-posta ödeme bilgisidir; vergi faturası yerine geçmez.</em></p>`
    ),
    textBody: `${amount} ödemeniz alındı. Geçerlilik: ${end}. Ref: ${args.providerRef}. Bu bildirim vergi faturası yerine geçmez.`,
  });
}

/**
 * Belge hazır bildirimi — SADECE düzenlenmiş belge için çağrılır.
 * E-posta iletimi resmî iletimle AYNI başarı sayılmaz; ileti metni
 * dekont/fatura ayrımını korur. Demo önizlemelerde konu açıkça demo yazar.
 */
export async function sendInvoiceReadyEmail(args: {
  to: string;
  planLabel: string;
  totalMinor: number;
  periodStart: string;
  periodEnd: string;
  detailUrl: string;
  demo: boolean;
}): Promise<SaasEmailResult> {
  const total = formatMinorTR(args.totalMinor);
  const period = `${new Date(args.periodStart).toLocaleDateString("tr-TR")} – ${new Date(args.periodEnd).toLocaleDateString("tr-TR")}`;
  return sendSaasEmail({
    to: args.to,
    subject: args.demo ? "[DEMO] NeviiHub belge önizlemeniz hazır" : "NeviiHub abonelik belgeniz hazır",
    htmlBody: layout(
      args.demo ? "Demo belge önizlemesi (mali belge değildir)" : "Belgeniz hazır",
      args.demo
        ? `<p><strong>${args.planLabel}</strong> (${total}, ${period}) için DEMO belge önizlemesi hazırdır. Bu önizleme mali belge değildir; resmî belge numarası içermez.</p>\n<p><a href="${args.detailUrl}">Önizlemeyi görüntüleyin</a></p>`
        : `<p><strong>${args.planLabel}</strong> (${total}, ${period}) aboneliğinize ait belgeniz hazırdır.</p>\n<p><a href="${args.detailUrl}">Belgeyi görüntüleyin</a></p>\n<p><em>Resmî iletim durumu hesabınızdaki belge detayında ayrıca gösterilir.</em></p>`
    ),
    textBody: args.demo
      ? `DEMO önizleme (mali belge değildir): ${args.planLabel} ${total} ${period} ${args.detailUrl}`
      : `Belgeniz hazır: ${args.planLabel} ${total} ${period} ${args.detailUrl}`,
  });
}

export async function sendCheckoutInvitationEmail(args: {
  to: string;
  planLabel: string;
  amountMinor: number;
  checkoutUrl: string;
  expiresAt: string;
}): Promise<SaasEmailResult> {
  const amount = formatMinorTR(args.amountMinor);
  const exp = new Date(args.expiresAt).toLocaleDateString("tr-TR");
  return sendSaasEmail({
    to: args.to,
    subject: "NeviiHub abonelik davetiniz",
    htmlBody: layout(
      "Abonelik daveti",
      `<p><strong>${args.planLabel}</strong> (${amount}) için güvenli ödeme davetiniz hazır.</p>
<p><a href="${args.checkoutUrl}">Ödemeyi güvenli sayfada tamamlayın</a> — davet ${exp} tarihine kadar geçerlidir.</p>
<p>Kart bilgileriniz yalnızca ödeme sağlayıcısının güvenli sayfasında alınır; NeviiHub kart bilginizi görmez ve saklamaz.</p>`
    ),
    textBody: `${args.planLabel} (${amount}) davetiniz: ${args.checkoutUrl} — geçerlilik: ${exp}.`,
  });
}

/**
 * Kayıt sürdürme bağlantısı — bağlantısını kaybeden alıcıya, SADECE
 * kayıttaki e-posta adresine gönderilir (posta kutusu sahipliği kanıtı).
 * Yanıt HER ZAMAN aynıdır (kayıt var/yok bilgisi sızdırılmaz).
 */
/** Platform sahibine yeni talep bildirimi (kurum + tür + zaman + detay bağlantısı; kimlik/fatura verisi yok). */
export async function sendNewRequestNotification(args: {
  to: string;
  kindLabel: string;
  institutionName: string;
  createdAtDisplay: string;
  detailUrl: string;
}): Promise<SaasEmailResult> {
  return sendSaasEmail({
    to: args.to,
    subject: `Yeni ${args.kindLabel}: ${args.institutionName}`,
    htmlBody: layout(
      `Yeni ${args.kindLabel}`,
      `<p><strong>${args.institutionName}</strong> — ${args.createdAtDisplay}.</p>\n<p><a href="${args.detailUrl}">NeviiOS'ta incele</a></p>`
    ),
    textBody: `Yeni ${args.kindLabel}: ${args.institutionName} — ${args.createdAtDisplay}. İncele: ${args.detailUrl}`,
  });
}

export async function sendOrderResumeEmail(args: {
  to: string;
  institutionName: string;
  resumeUrl: string;
  expiresAt: string;
}): Promise<SaasEmailResult> {
  const exp = new Date(args.expiresAt).toLocaleDateString("tr-TR");
  return sendSaasEmail({
    to: args.to,
    subject: "NeviiHub satın alma kaydınıza devam edin",
    htmlBody: layout(
      "Kaydınıza devam edin",
      `<p><strong>${args.institutionName}</strong> için başlatılmış ödeme bekleyen kaydınız var.</p>\n<p><a href="${args.resumeUrl}">Kaydıma güvenli şekilde devam et</a> — bağlantı ${exp} tarihine kadar geçerlidir, tek kayıt içindir ve başkasıyla paylaşılmamalıdır.</p>`
    ),
    textBody: `Kaydınıza devam edin: ${args.resumeUrl} — geçerlilik: ${exp}.`,
  });
}

/**
 * Hesap e-postası (ödeme sonrası): kabul edilen sözleşme sürümleri + ödeme
 * özeti + kurulum açıklaması ve BAĞLANTISI. Kurulum bağlantısı YALNIZ bu
 * adrese gider (muhasebe adresine ASLA).
 */
export async function sendOrderAccountEmail(args: {
  to: string;
  institutionName: string;
  planLabel: string;
  totalDisplay: string;
  periodLabel: string;
  docTitles: { title: string; version: string }[];
  setupUrl: string | null;
}): Promise<SaasEmailResult> {
  const docs = args.docTitles.map((d) => `<li>${d.title} (sürüm ${d.version})</li>`).join("");
  return sendSaasEmail({
    to: args.to,
    subject: "NeviiHub ödemeniz alındı — hesabınızı kurun",
    htmlBody: layout(
      "Ödemeniz alındı",
      `<p><strong>${args.institutionName}</strong> için <strong>${args.planLabel}</strong> (${args.totalDisplay}, ${args.periodLabel}) ödemeniz doğrulandı.</p>\n<p><strong>Kabul ettiğiniz belgeler:</strong></p>\n<ul>${docs}</ul>\n${
        args.setupUrl
          ? `<p><a href="${args.setupUrl}">Hesabınıza erişmek için parolanızı belirleyin</a> — bağlantı tek kullanımlıktır.</p>`
          : `<p>Hesap kurulum bağlantınız ayrıca iletilecek.</p>`
      }`
    ),
    textBody: `Ödemeniz alındı: ${args.planLabel} ${args.totalDisplay} ${args.periodLabel}. ${args.setupUrl ? `Kurulum: ${args.setupUrl}` : ""}`,
  });
}

/**
 * Fatura e-postası: resmî belge durumu. Belge hazır değilse "hazırlanıyor"
 * denir; "gönderildi" YALNIZCA doğrulandığında yazılır. Kendi PDF'miz resmî
 * fatura gibi sunulmaz; sipariş özeti dekont diye etiketlenmez.
 */
export async function sendOrderInvoiceEmail(args: {
  to: string;
  institutionName: string;
  planLabel: string;
  totalDisplay: string;
  invoiceReady: boolean;
  invoiceUrl: string | null;
}): Promise<SaasEmailResult> {
  return sendSaasEmail({
    to: args.to,
    subject: args.invoiceReady ? "NeviiHub faturanız hazır" : "NeviiHub ödemeniz alındı — faturanız hazırlanıyor",
    htmlBody: layout(
      args.invoiceReady ? "Faturanız hazır" : "Faturanız hazırlanıyor",
      args.invoiceReady && args.invoiceUrl
        ? `<p><strong>${args.institutionName}</strong> için <strong>${args.planLabel}</strong> (${args.totalDisplay}) faturanız hazırdır.</p>\n<p><a href="${args.invoiceUrl}">Faturayı görüntüleyin</a></p>`
        : `<p><strong>${args.institutionName}</strong> için ödemeniz alındı. Faturanız hazırlanıyor; hazır olduğunda bu adrese gönderilecek.</p>`
    ),
    textBody:
      args.invoiceReady && args.invoiceUrl
        ? `Faturanız hazır: ${args.invoiceUrl}`
        : `Ödemeniz alındı; faturanız hazırlanıyor (${args.planLabel} ${args.totalDisplay}).`,
  });
}
