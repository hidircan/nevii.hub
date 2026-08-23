export type SmsProviderName = "twilio" | "console";

export function getSmsProviderName(): SmsProviderName {
  const p = (process.env.SMS_PROVIDER || "").toLowerCase();
  if (p === "twilio" || p === "console") return p;
  if (process.env.TWILIO_ACCOUNT_SID && (process.env.TWILIO_SMS_FROM || process.env.TWILIO_FROM)) {
    return "twilio";
  }
  return "console";
}

export function isSmsTestMode(): boolean {
  const v = (process.env.SMS_TEST_MODE || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function getSmsConfig() {
  return {
    provider: getSmsProviderName(),
    testMode: isSmsTestMode(),
    allowlistRaw: process.env.SMS_TEST_ALLOWED_RECIPIENTS || "",
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
    twilioFrom: process.env.TWILIO_SMS_FROM || process.env.TWILIO_FROM || "",
  };
}

export function isSmsProviderConfigured(): boolean {
  const cfg = getSmsConfig();
  if (cfg.provider === "console") return false;
  return Boolean(cfg.twilioAccountSid && cfg.twilioAuthToken && cfg.twilioFrom);
}
