import type { WhatsAppProviderName } from "./types";

export function getWhatsAppProviderName(): WhatsAppProviderName {
  const p = (process.env.WHATSAPP_PROVIDER || "console").toLowerCase();
  if (p === "meta" || p === "twilio" || p === "evolution" || p === "console") {
    return p;
  }
  return "console";
}

export function getWhatsAppConfig() {
  return {
    provider: getWhatsAppProviderName(),
    // No predictable default in production — an unset verify token must fail closed,
    // never fall back to a guessable constant an attacker could pass on `hub.verify_token`.
    verifyToken:
      process.env.WHATSAPP_VERIFY_TOKEN ||
      (process.env.NODE_ENV === "production" ? "" : "nevii-hub-wa-verify"),
    // Meta Cloud API
    metaToken: process.env.WHATSAPP_META_TOKEN || process.env.META_WA_TOKEN || "",
    metaPhoneNumberId:
      process.env.WHATSAPP_META_PHONE_NUMBER_ID || process.env.META_WA_PHONE_NUMBER_ID || "",
    metaApiVersion: process.env.WHATSAPP_META_API_VERSION || "v19.0",
    metaAppSecret: process.env.WHATSAPP_META_APP_SECRET || process.env.META_WA_APP_SECRET || "",
    // Twilio
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
    twilioFrom: process.env.TWILIO_WHATSAPP_FROM || "", // e.g. whatsapp:+14155238886
    // Evolution API
    evolutionBaseUrl: process.env.EVOLUTION_API_URL || "",
    evolutionApiKey: process.env.EVOLUTION_API_KEY || "",
    evolutionInstance: process.env.EVOLUTION_INSTANCE || "",
    // Security
    webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET || "",
  };
}

/** Normalize to digits only, strip leading + */
export function normalizePhone(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0") && d.length === 11) d = `90${d.slice(1)}`;
  return d;
}
