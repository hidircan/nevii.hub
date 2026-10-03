/**
 * E-posta transport seçimi — `src/lib/sms/transport.ts` ile AYNI desen.
 * SMTP yapılandırılmamışsa "console" transport'a düşülür: e-postayı LOGLAR,
 * gönderimi ASLA sahte başarılı göstermez (`delivered:false, blocked:true`) —
 * görev kuralı: "implement the workflow but clearly mark production email
 * delivery as BLOCKED rather than faking delivery".
 */
import { getEmailConfig, isEmailProviderConfigured, type EmailProviderName } from "./config";
import { logger } from "../logger";
import type { EmailSendInput, EmailSendResult, EmailTransport } from "./types";

let override: EmailTransport | null = null;

export function setEmailTransportForTests(t: EmailTransport | null) {
  override = t;
}

/** Log için alıcıyı maskeler: kişisel veri (e-posta yerel kısmı) loga yazılmaz (2026-10-03). */
export function maskEmailForLog(address: string): string {
  const at = address.lastIndexOf("@");
  return at > 0 ? `***@${address.slice(at + 1)}` : "***";
}

function consoleTransport(): EmailTransport {
  return {
    name: "console",
    async send(input: EmailSendInput): Promise<EmailSendResult> {
      // Konu ve gövde loglanmaz (bağlantı/jeton içerebilir); alıcı maskelenir.
      logger.warn(`[email:console] Teslim edilmedi (SMTP yok ya da EMAIL_PROVIDER=console). to=${maskEmailForLog(input.to)}`);
      return { delivered: false, blocked: true, reason: "EMAIL_PROVIDER_NOT_CONFIGURED" };
    },
  };
}

function smtpTransport(): EmailTransport {
  const cfg = getEmailConfig();
  return {
    name: "smtp",
    async send(input: EmailSendInput): Promise<EmailSendResult> {
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.createTransport({
          host: cfg.smtpHost,
          port: cfg.smtpPort,
          secure: cfg.smtpSecure,
          auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
        });
        const info = await transporter.sendMail({
          from: `"${cfg.fromName}" <${cfg.fromAddress}>`,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
          // 10. tur iş #2 — satır-içi (CID) ekler: kurum logosu e-postada
          // GERÇEKTEN görünür (data-URI Gmail/Outlook'ta çalışmaz).
          attachments: (input.attachments ?? []).map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.contentBase64, "base64"),
            contentType: a.contentType,
            cid: a.cid,
            contentDisposition: "inline" as const,
          })),
        });
        return { delivered: true, messageId: info.messageId };
      } catch (e) {
        // Ham hata nesnesi alıcı adreslerini içerebilir: yalnız kod/durum loglanır.
        const err = e as { code?: string; responseCode?: number; command?: string };
        logger.error("SMTP gönderimi başarısız", { code: err?.code, responseCode: err?.responseCode, command: err?.command });
        return { delivered: false, blocked: false, reason: "SMTP_SEND_FAILED" };
      }
    },
  };
}

export function getEmailTransport(): EmailTransport {
  if (override) return override;
  const name: EmailProviderName = getEmailConfig().provider;
  if (name === "smtp" && isEmailProviderConfigured()) return smtpTransport();
  return consoleTransport();
}
