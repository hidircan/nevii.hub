import { consumeRateLimit, __resetRateLimitForTests } from "../rate-limit";

const WINDOW_MS = 60_000;
const MAX = 60;

export function consumeSmsWebhookRateLimit(ip: string): boolean {
  return consumeRateLimit("sms-webhook", ip, { windowMs: WINDOW_MS, max: MAX });
}

export function __resetSmsWebhookRateLimitForTests() {
  __resetRateLimitForTests("sms-webhook");
}
