/**
 * İK e-postaları — varsayılan şablonlar, yer tutucu doldurma, marka kabuğu, gönderim + zaman çizelgesine log.
 * Gönderim TEK noktadan (`sendEmail`) yapılır; SMTP yapılandırılmamışsa sonuç dürüstçe "gönderilemedi" olarak
 * döner ve loglanır (sahte başarı yok — bkz. email/transport.ts).
 */
import { institutionLogoEmailBlock } from "../institution-logo";
import { applicationNumber, INTERVIEW_KIND_LABELS } from "./constants";
import { createTemplate, listTemplates } from "./store";
import type { EmailTemplateKind, RecruitmentApplication, RecruitmentEmailTemplate, RecruitmentInterview, RecruitmentJob } from "./types";

export type InstitutionInfo = { name: string; logoUrl?: string; phone?: string; email?: string; website?: string };

export { EMAIL_KIND_LABELS, EMAIL_PLACEHOLDERS } from "./email-meta";
import { EMAIL_PLACEHOLDERS } from "./email-meta";

type DefaultTemplate = { systemKey: EmailTemplateKind; kind: EmailTemplateKind; name: string; subject: string; body: string };

export const DEFAULT_RECRUITMENT_TEMPLATES: DefaultTemplate[] = [
  {
    systemKey: "received",
    kind: "received",
    name: "Başvurunuz alındı",
    subject: "{{kurum_adi}} — başvurunuz alındı ({{basvuru_no}})",
    body:
      "Merhaba {{aday_adi}},\n\n{{pozisyon}} pozisyonu için yaptığınız başvuru bize ulaştı. Başvuru numaranız: {{basvuru_no}}.\n\n" +
      "Başvurunuzu en kısa sürede değerlendirip sizinle iletişime geçeceğiz. Bu süreçte ek bilgi gerekirse bu e-posta adresinden size ulaşacağız.\n\n" +
      "İlginiz için teşekkür ederiz.\n\nSevgilerimizle,\n{{kurum_adi}} İnsan Kaynakları",
  },
  {
    systemKey: "interview_invite",
    kind: "interview_invite",
    name: "Görüşme / deneme dersi daveti",
    subject: "{{kurum_adi}} — {{gorusme_turu}} daveti",
    body:
      "Merhaba {{aday_adi}},\n\n{{pozisyon}} başvurunuzu değerlendirdik ve sizi {{gorusme_turu}} için davet etmek istiyoruz.\n\n" +
      "Tarih: {{gorusme_tarihi}}\nSaat: {{gorusme_saati}}\nYer / bağlantı: {{gorusme_yeri}}\n\n" +
      "Bu saat size uygun değilse lütfen bu e-postayı yanıtlayarak ya da {{kurum_telefon}} numarasından bize bildirin.\n\n" +
      "Görüşmek üzere,\n{{kurum_adi}}",
  },
  {
    systemKey: "positive",
    kind: "positive",
    name: "Olumlu dönüş — sonraki adım",
    subject: "{{kurum_adi}} — başvurunuz hakkında güzel haber",
    body:
      "Merhaba {{aday_adi}},\n\n{{pozisyon}} başvurunuzu olumlu değerlendirdiğimizi bildirmekten mutluluk duyuyoruz. " +
      "Sürecin bir sonraki adımı için kısa süre içinde sizinle iletişime geçeceğiz.\n\n" +
      "Sorularınız için {{kurum_telefon}} / {{kurum_eposta}} üzerinden bize ulaşabilirsiniz.\n\nSevgilerimizle,\n{{kurum_adi}}",
  },
  {
    systemKey: "offer",
    kind: "offer",
    name: "İş teklifi",
    subject: "{{kurum_adi}} — iş teklifimiz",
    body:
      "Merhaba {{aday_adi}},\n\nDeğerlendirme sürecimiz sonunda sizi {{pozisyon}} olarak ekibimizde görmekten memnuniyet duyacağımızı bildirmek isteriz.\n\n" +
      "Çalışma koşulları ve başlangıç tarihini konuşmak üzere sizinle iletişime geçeceğiz.\n\nTebrikler ve hoş geldiniz!\n{{kurum_adi}}",
  },
  {
    systemKey: "negative",
    kind: "negative",
    name: "Olumsuz dönüş (nazik)",
    subject: "{{kurum_adi}} — başvurunuz hakkında",
    body:
      "Merhaba {{aday_adi}},\n\n{{pozisyon}} pozisyonuna gösterdiğiniz ilgi ve ayırdığınız zaman için teşekkür ederiz. " +
      "Başvurunuzu dikkatle değerlendirdik; ancak bu aşamada pozisyonun gerekliliklerine daha yakın bir profille ilerleme kararı aldık.\n\n" +
      "Bilgilerinizi, uygun bir pozisyon açıldığında tekrar değerlendirmek üzere (KVKK saklama süresi boyunca) aday havuzumuzda tutacağız.\n\n" +
      "Müzik yolculuğunuzda başarılar dileriz.\n{{kurum_adi}}",
  },
];

/** Kurumda hiç şablon yoksa varsayılanları bir kez yazar (idempotent). */
export async function ensureDefaultTemplates(tenantId: string): Promise<RecruitmentEmailTemplate[]> {
  const { withKeyLock } = await import("../keyed-lock");
  return withKeyLock(`recruitment-templates:${tenantId}`, () => ensureDefaultTemplatesUnlocked(tenantId));
}

async function ensureDefaultTemplatesUnlocked(tenantId: string): Promise<RecruitmentEmailTemplate[]> {
  const existing = await listTemplates(tenantId);
  const have = new Set(existing.map((t) => t.systemKey).filter(Boolean));
  const missing = DEFAULT_RECRUITMENT_TEMPLATES.filter((d) => !have.has(d.systemKey));
  if (missing.length === 0) return existing;
  for (const d of missing) {
    await createTemplate(tenantId, { kind: d.kind, name: d.name, subject: d.subject, body: d.body, active: true, systemKey: d.systemKey }, null);
  }
  return listTemplates(tenantId);
}

const PLACEHOLDER_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

export function unknownPlaceholders(text: string): string[] {
  const allowed = new Set(EMAIL_PLACEHOLDERS.map((p) => p.name));
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(text))) if (!allowed.has(m[1]!.toLowerCase())) found.add(m[1]!);
  return [...found];
}

function formatTrDate(isoStr: string): { date: string; time: string } {
  const d = new Date(isoStr);
  return {
    date: new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric", weekday: "long" }).format(d),
    time: new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }).format(d),
  };
}

export function buildPlaceholderValues(input: {
  app: Pick<RecruitmentApplication, "firstName" | "lastName" | "seq">;
  job: Pick<RecruitmentJob, "title"> | null;
  institution: InstitutionInfo;
  interview?: Pick<RecruitmentInterview, "kind" | "scheduledAt" | "location"> | null;
}): Record<string, string> {
  const { app, job, institution, interview } = input;
  const when = interview ? formatTrDate(interview.scheduledAt) : null;
  return {
    aday_adi: app.firstName,
    aday_ad_soyad: `${app.firstName} ${app.lastName}`.trim(),
    pozisyon: job?.title ?? "genel başvuru",
    basvuru_no: applicationNumber(app.seq),
    kurum_adi: institution.name,
    kurum_telefon: institution.phone || "-",
    kurum_eposta: institution.email || "-",
    gorusme_turu: interview ? INTERVIEW_KIND_LABELS[interview.kind].toLocaleLowerCase("tr") : "görüşme",
    gorusme_tarihi: when?.date ?? "-",
    gorusme_saati: when?.time ?? "-",
    gorusme_yeri: interview?.location || "-",
  };
}

export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER_RE, (_m, name: string) => values[name.toLowerCase()] ?? "");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Düz metin gövde → güvenli HTML (kaçış + paragraf/satır sonu). Yönetici HTML yazamaz; XSS yüzeyi yok. */
export function textToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export type RenderedRecruitmentEmail = {
  subject: string;
  html: string;
  text: string;
  attachments: { cid: string; filename: string; contentType: string; contentBase64: string }[] | undefined;
};

export function renderRecruitmentEmail(input: {
  subject: string;
  body: string;
  values: Record<string, string>;
  institution: InstitutionInfo;
}): RenderedRecruitmentEmail {
  const subject = fillPlaceholders(input.subject, input.values).replace(/[\r\n]+/g, " ").trim().slice(0, 300);
  const text = fillPlaceholders(input.body, input.values);
  const logo = institutionLogoEmailBlock(input.institution.logoUrl, input.institution.name);
  const footer = [input.institution.name, input.institution.phone, input.institution.email, input.institution.website]
    .filter(Boolean)
    .map((x) => escapeHtml(String(x)))
    .join(" · ");
  const html =
    `<!doctype html><html lang="tr"><body style="margin:0;padding:0;background:#f4f4f5;">` +
    `<div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">` +
    `<div style="background:#ffffff;border-radius:12px;padding:28px 24px;border:1px solid #e4e4e7;">` +
    logo.html +
    textToHtml(text) +
    `</div>` +
    `<p style="text-align:center;font-size:12px;color:#71717a;margin:16px 0 0;">${footer}</p>` +
    `<p style="text-align:center;font-size:11px;color:#a1a1aa;margin:6px 0 0;">Bu e-posta iş başvurunuz nedeniyle gönderilmiştir. Kişisel verileriniz KVKK kapsamında korunur.</p>` +
    `</div></body></html>`;
  return { subject, html, text, attachments: logo.attachment ? [logo.attachment] : undefined };
}

export type SendOutcome = { delivered: boolean; blocked: boolean; reason?: string };

export async function sendRecruitmentEmail(to: string, rendered: RenderedRecruitmentEmail): Promise<SendOutcome> {
  const { sendEmail } = await import("../email");
  try {
    const r = await sendEmail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text, attachments: rendered.attachments });
    return r.delivered ? { delivered: true, blocked: false } : { delivered: false, blocked: r.blocked, reason: r.reason };
  } catch (e) {
    return { delivered: false, blocked: false, reason: e instanceof Error ? e.message : "SEND_FAILED" };
  }
}

export function outcomeLabel(o: SendOutcome): string {
  if (o.delivered) return "gönderildi";
  if (o.blocked) return "gönderilemedi — e-posta sağlayıcısı (SMTP) yapılandırılmamış";
  return "gönderilemedi — sağlayıcı hatası";
}
