import { getSmsConfig, isSmsProviderConfigured, type SmsProviderName } from "./config";
import type { SmsSendInput, SmsSendResult, SmsTransport } from "./types";

let override: SmsTransport | null = null;

export function setSmsTransportForTests(t: SmsTransport | null) {
  override = t;
}

function consoleTransport(): SmsTransport {
  return {
    name: "console",
    async send(): Promise<SmsSendResult> {
      return { ok: false, error: "SMS sağlayıcısı yapılandırılmamış.", errorCode: "NOT_CONFIGURED" };
    },
  };
}

function twilioTransport(): SmsTransport {
  const cfg = getSmsConfig();
  return {
    name: "twilio",
    async send(input: SmsSendInput): Promise<SmsSendResult> {
      if (!cfg.twilioAccountSid || !cfg.twilioAuthToken || !cfg.twilioFrom) {
        return { ok: false, error: "SMS sağlayıcısı yapılandırılmamış.", errorCode: "NOT_CONFIGURED" };
      }
      const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioAccountSid}/Messages.json`;
      const auth = Buffer.from(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`).toString("base64");
      const params = new URLSearchParams({
        From: cfg.twilioFrom,
        To: input.toE164,
        Body: input.body.slice(0, 1600),
      });
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });
        const data = (await res.json()) as { sid?: string; message?: string; code?: number };
        if (!res.ok) {
          return {
            ok: false,
            error: "SMS gönderilemedi.",
            errorCode: data.code ? String(data.code) : `HTTP_${res.status}`,
          };
        }
        return { ok: true, messageId: data.sid };
      } catch {
        return { ok: false, error: "SMS sağlayıcısına ulaşılamadı.", errorCode: "NETWORK" };
      }
    },
  };
}

export function getSmsTransport(): SmsTransport {
  if (override) return override;
  const name: SmsProviderName = getSmsConfig().provider;
  if (name === "twilio" && isSmsProviderConfigured()) return twilioTransport();
  return consoleTransport();
}
