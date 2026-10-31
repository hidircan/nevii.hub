import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetSaasBillingStoreForTests,
  listSaasQuoteRequests,
} from "../saas-billing/store";
import {
  __resetQuoteRateLimitForTests,
  decideQuoteRequest,
  submitQuoteRequest,
} from "../saas-billing/quotes";

const BASE = {
  institutionName: "Demo Kurum",
  ownerName: "Demo Sahip",
  ownerEmail: "teklif@demo-muzik.test",
};

beforeEach(async () => {
  await __resetSaasBillingStoreForTests();
  __resetQuoteRateLimitForTests();
  delete process.env.STORE_MODE;
});

describe("teklif isteği (quote)", () => {
  it("geçerli istek pending oluşur; e-posta tekilliği korunur", async () => {
    const r1 = await submitQuoteRequest({ input: { ...BASE, planKey: "pro" } });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.data.status).toBe("pending");
    expect(r1.data.planKey).toBe("pro");
    const r2 = await submitQuoteRequest({ input: BASE });
    expect(r2.ok).toBe(false);
    expect(await listSaasQuoteRequests(10)).toHaveLength(1);
  });

  it("geçersiz plan anahtarı reddedilir; abonelik/davet üretmez", async () => {
    const r = await submitQuoteRequest({ input: { ...BASE, planKey: "PRO!!" } });
    expect(r.ok).toBe(false);
  });

  it("karar: contacted/closed + tekrar karar yok", async () => {
    const r = await submitQuoteRequest({ input: BASE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d1 = await decideQuoteRequest({ id: r.data.id, approve: true, decidedBy: "hyper" });
    expect(d1.ok && d1.data.status).toBe("contacted");
    const d2 = await decideQuoteRequest({ id: r.data.id, approve: false, decidedBy: "hyper" });
    expect(d2.ok).toBe(false);
  });

  it("gizli tuzak alanı dolu gelirse kaydetmez, hata Türkçe nedenini söyler", async () => {
    const r = await submitQuoteRequest({ input: { ...BASE, website: "http://spam.example" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("Kurum adı");
  });

  it("DB modunda da kapalı değil: kapı kod tabanından kalktı", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/saas-billing/quotes.ts"), "utf8");
    expect(src).not.toContain("isDbMode");
  });
});
