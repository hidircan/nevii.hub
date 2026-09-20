/**
 * Çalıştırma: npm run test:release (node:test + tsx).
 * Push preflight: secret değeri YAZDIRMAZ, dosya değiştiremez, ağa bağlanmaz.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPushReport, validatePushRelease } from "./validate-push-release";

const FULL = {
  PUSH_ENABLED: "true",
  EXPO_PUSH_ACCESS_TOKEN: "ExponentToken[xxxxxxxxxxxxxxxxxxxxxx]",
  NOTIFICATION_CRON_SECRET: "en-az-on-alti-karakterli-secret",
  APP_BASE_URL: "https://panel.ornek.com",
  EXPO_PUBLIC_API_URL: "https://panel.ornek.com",
};

test("tam env: hata yok, çıkış 0", async () => {
  const findings = await validatePushRelease({ ...FULL }, "preview");
  assert.equal(findings.filter((f) => f.level === "error").length, 0);
  assert.equal(formatPushReport(findings).exitCode, 0);
});

test("boş env: fail-closed (cron secret + base url hatası)", async () => {
  const findings = await validatePushRelease({}, "preview");
  const errors = findings.filter((f) => f.level === "error").map((f) => f.message);
  assert.ok(errors.some((m) => m.includes("NOTIFICATION_CRON_SECRET")));
  assert.ok(errors.some((m) => m.includes("APP_BASE_URL")));
  assert.equal(formatPushReport(findings).exitCode, 1);
});

test("store hedefi daha katı (push kapalıysa hata)", async () => {
  const preview = await validatePushRelease({}, "preview");
  const store = await validatePushRelease({}, "store");
  const previewErrors = preview.filter((f) => f.level === "error").length;
  const storeErrors = store.filter((f) => f.level === "error").length;
  assert.ok(storeErrors > previewErrors);
});

test("kısa secret hata verir, yerel URL store'da hata verir", async () => {
  const short = await validatePushRelease({ ...FULL, NOTIFICATION_CRON_SECRET: "kisa" }, "preview");
  assert.ok(short.some((f) => f.level === "error" && f.message.includes("çok kısa")));
  const local = await validatePushRelease({ ...FULL, EXPO_PUBLIC_API_URL: "http://192.168.1.5:3000" }, "store");
  assert.ok(local.some((f) => f.level === "error" && f.message.includes("EXPO_PUBLIC_API_URL")));
});

test("hiçbir çıktı secret değerini içermez", async () => {
  const findings = await validatePushRelease({ ...FULL }, "preview");
  const { text } = formatPushReport(findings);
  assert.ok(!text.includes(FULL.EXPO_PUSH_ACCESS_TOKEN));
  assert.ok(!text.includes(FULL.NOTIFICATION_CRON_SECRET));
  assert.ok(!text.includes("panel.ornek.com"));
});
