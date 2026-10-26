import { describe, it, expect, beforeEach } from "vitest";
import { resetPlatformStoreForTests } from "../platform/store";
import {
  __resetSaasBillingStoreForTests,
  boundedPayload,
  insertSaasWebhookEvent,
  recordSaasAttempt,
  stripCardFields,
} from "../saas-billing/store";

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
});

describe("saas store güvenlik sınırları", () => {
  it("kart alanları payload'dan ayıklanır", () => {
    const clean = stripCardFields({
      orderReferenceCode: "ord",
      cardNumber: "4111111111111111",
      nested: { cvv: "123", ok: 1 },
      pan: "x",
    }) as Record<string, unknown>;
    expect(clean.orderReferenceCode).toBe("ord");
    expect("cardNumber" in clean).toBe(false);
    expect((clean.nested as Record<string, unknown>).ok).toBe(1);
    expect("cvv" in (clean.nested as Record<string, unknown>)).toBe(false);
    expect("pan" in clean).toBe(false);
  });

  it("aşırı büyük payload reddedilir", () => {
    expect(() => boundedPayload({ big: "x".repeat(16 * 1024) })).toThrow();
  });

  it("tahsilat denemesi idempotencyKey ile tekillenir", async () => {
    const base = {
      id: "att_1", tenantId: "t1", subscriptionId: "s1",
      periodStart: "2026-02-01T00:00:00.000Z", periodEnd: "2026-03-01T00:00:00.000Z",
      amountMinor: 100, currency: "TRY" as const, status: "pending" as const, kind: "charge" as const,
      attemptNo: 1, idempotencyKey: "idem_1", providerRef: null, providerEventId: null,
      error: null, createdAt: "2026-02-01T00:00:00.000Z",
    };
    const a = await recordSaasAttempt(base);
    const b = await recordSaasAttempt({ ...base, id: "att_2" });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(b.record.id).toBe("att_1");
  });

  it("webhook eventId tekillenir", async () => {
    const base = {
      id: "wh_1", provider: "iyzico", eventId: "evt_dup", eventType: "subscription.order.success",
      tenantId: null, subscriptionId: null, payload: { a: 1 }, signatureValid: true,
      status: "received" as const, processedAt: null, error: null, createdAt: "2026-02-01T00:00:00.000Z",
    };
    const a = await insertSaasWebhookEvent(base);
    const b = await insertSaasWebhookEvent({ ...base, id: "wh_2" });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
  });
});
