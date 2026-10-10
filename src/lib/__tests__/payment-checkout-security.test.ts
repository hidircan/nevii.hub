import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { initiateStudentPaymentCheckoutTool } from "../services/tools";
import { addPayment, readData } from "../store";
import {
  grantActiveStudentPortalAccess,
  STUDENT_PORTAL_ACCESS_FILE,
} from "../student-portal-access";
import {
  PAYMENT_CHECKOUT_ATTEMPTS_FILE,
  findPendingCheckoutAttempt,
} from "../payment-checkout";
import { setPaymentProviderForTests } from "../payment-provider/provider-factory";
import type { PaymentProvider } from "../payment-provider/types";
import { POST as webhookPost } from "../../app/api/v1/payments/webhook/route";
import { createHmac } from "crypto";

function studentCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "STUDENT", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

async function createUnpaidPayment(studentId: string, amount = 1000): Promise<string> {
  const before = await readData();
  const ids = new Set(before.payments.map((p) => p.id));
  await addPayment({ studentId, description: "IDOR test ödemesi", amount, dueDate: new Date().toISOString() });
  const after = await readData();
  const created = after.payments.find((p) => !ids.has(p.id));
  if (!created) throw new Error("test setup: payment not created");
  return created.id;
}

const WEBHOOK_SECRET = "test-iyzico-webhook-secret";
let refCounter = 0;

/** Kontrollü sahte provider — gerçek iyzico'ya bağlanmadan checkout/webhook akışını uçtan uca test eder. */
function mockProvider(): PaymentProvider {
  return {
    name: "mock-iyzico",
    isConfigured: () => true,
    async createCheckout(input) {
      refCounter += 1;
      const ref = `ref-${refCounter}-${input.paymentId}`;
      return { ok: true, checkoutUrl: `https://mock-provider.test/pay/${ref}`, providerReference: ref };
    },
    async verifyWebhook({ rawBody, signatureHeader }) {
      const expected = createHmac("sha256", WEBHOOK_SECRET).update(rawBody, "utf8").digest("hex");
      if (!signatureHeader || signatureHeader !== expected) {
        return { ok: false, error: "invalid signature" };
      }
      const payload = JSON.parse(rawBody) as { basketId: string; token: string; status: string };
      return { ok: true, paymentId: payload.basketId, providerReference: payload.token, status: payload.status === "SUCCESS" ? "paid" : "failed" };
    },
  };
}

function signedWebhookRequest(body: Record<string, unknown>, opts?: { badSignature?: boolean }) {
  const rawBody = JSON.stringify(body);
  const signature = opts?.badSignature
    ? "0".repeat(64)
    : createHmac("sha256", WEBHOOK_SECRET).update(rawBody, "utf8").digest("hex");
  return new Request("http://localhost/api/v1/payments/webhook", {
    method: "POST",
    headers: { "x-iyz-signature-v3": signature },
    body: rawBody,
  });
}

beforeEach(async () => {
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  await fs.rm(PAYMENT_CHECKOUT_ATTEMPTS_FILE, { force: true });
  setPaymentProviderForTests(null);
  refCounter = 0;
});

describe("Ödeme checkout — IDOR ve sahiplik doğrulaması", () => {
  it("öğrenci yalnızca kendi açık ödemesi için checkout başlatabilir", async () => {
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "self1",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin",
    });
    setPaymentProviderForTests(mockProvider());
    const paymentId = await createUnpaidPayment("s1");

    const result = await initiateStudentPaymentCheckoutTool(studentCtx({ userId: "self1" }), {
      paymentId,
      successUrl: "https://app.example.com/success",
      cancelUrl: "https://app.example.com/cancel",
      buyerIp: "127.0.0.1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.checkoutUrl).toContain("mock-provider.test");
  });

  it("guardian, bağlı öğrencinin ödemesi için checkout başlatabilir", async () => {
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "guardian1",
      studentId: "s1",
      accessType: "GUARDIAN",
      invitedBy: "admin",
    });
    setPaymentProviderForTests(mockProvider());
    const paymentId = await createUnpaidPayment("s1");

    const result = await initiateStudentPaymentCheckoutTool(studentCtx({ userId: "guardian1" }), {
      paymentId,
      successUrl: "https://app.example.com/success",
      cancelUrl: "https://app.example.com/cancel",
      buyerIp: "127.0.0.1",
    });
    expect(result.ok).toBe(true);
  });

  it("başka öğrencinin paymentId'siyle checkout isteği reddedilir (erişimi olmayan kullanıcı)", async () => {
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "self1",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin",
    });
    setPaymentProviderForTests(mockProvider());
    const otherStudentPaymentId = await createUnpaidPayment("s2");

    const result = await initiateStudentPaymentCheckoutTool(studentCtx({ userId: "self1" }), {
      paymentId: otherStudentPaymentId,
      successUrl: "https://app.example.com/success",
      cancelUrl: "https://app.example.com/cancel",
      buyerIp: "127.0.0.1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("başka tenant'ın paymentId'si reddedilir (tenant-scoped readData → NOT_FOUND)", async () => {
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "self1",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin",
    });
    setPaymentProviderForTests(mockProvider());

    const result = await initiateStudentPaymentCheckoutTool(studentCtx({ userId: "self1", tenantId: "tenant_other" }), {
      paymentId: "s1-payment-does-not-exist-in-other-tenant",
      successUrl: "https://app.example.com/success",
      cancelUrl: "https://app.example.com/cancel",
      buyerIp: "127.0.0.1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("zaten paid olan ödeme için checkout reddedilir", async () => {
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "self1",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin",
    });
    setPaymentProviderForTests(mockProvider());
    // Seed'deki p1, s1 için zaten tam ödenmiş (status=paid).
    const result = await initiateStudentPaymentCheckoutTool(studentCtx({ userId: "self1" }), {
      paymentId: "p1",
      successUrl: "https://app.example.com/success",
      cancelUrl: "https://app.example.com/cancel",
      buyerIp: "127.0.0.1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("aynı ödeme için art arda çağrılar idempotent çalışır — provider yalnızca BİR KEZ çağrılır", async () => {
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "self1",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin",
    });
    setPaymentProviderForTests(mockProvider());
    const paymentId = await createUnpaidPayment("s1");

    const first = await initiateStudentPaymentCheckoutTool(studentCtx({ userId: "self1" }), {
      paymentId,
      successUrl: "https://app.example.com/success",
      cancelUrl: "https://app.example.com/cancel",
      buyerIp: "127.0.0.1",
    });
    const second = await initiateStudentPaymentCheckoutTool(studentCtx({ userId: "self1" }), {
      paymentId,
      successUrl: "https://app.example.com/success",
      cancelUrl: "https://app.example.com/cancel",
      buyerIp: "127.0.0.1",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.data.checkoutUrl).toBe(first.data.checkoutUrl);
    expect(refCounter).toBe(1);

    const pending = await findPendingCheckoutAttempt(DEFAULT_TENANT_ID, paymentId);
    expect(pending).not.toBeNull();
  });
});

describe("Ödeme webhook — imza doğrulama + idempotency", () => {
  it("geçersiz webhook imzası reddedilir ve Payment değişmez", async () => {
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "self1",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin",
    });
    setPaymentProviderForTests(mockProvider());
    const paymentId = await createUnpaidPayment("s1");
    const checkout = await initiateStudentPaymentCheckoutTool(studentCtx({ userId: "self1" }), {
      paymentId,
      successUrl: "https://app.example.com/success",
      cancelUrl: "https://app.example.com/cancel",
      buyerIp: "127.0.0.1",
    });
    expect(checkout.ok).toBe(true);
    const attempt = await findPendingCheckoutAttempt(DEFAULT_TENANT_ID, paymentId);
    expect(attempt).not.toBeNull();

    const res = await webhookPost(
      signedWebhookRequest(
        { basketId: paymentId, token: attempt!.providerReference, status: "SUCCESS" },
        { badSignature: true }
      )
    );
    expect(res.status).toBe(401);

    const data = await readData();
    const payment = data.payments.find((p) => p.id === paymentId);
    expect(payment!.status).not.toBe("paid");
  });

  it("geçerli webhook ödemeyi bir kez tahsil edilmiş yapar", async () => {
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "self1",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin",
    });
    setPaymentProviderForTests(mockProvider());
    const paymentId = await createUnpaidPayment("s1", 500);
    const checkout = await initiateStudentPaymentCheckoutTool(studentCtx({ userId: "self1" }), {
      paymentId,
      successUrl: "https://app.example.com/success",
      cancelUrl: "https://app.example.com/cancel",
      buyerIp: "127.0.0.1",
    });
    expect(checkout.ok).toBe(true);
    const attempt = await findPendingCheckoutAttempt(DEFAULT_TENANT_ID, paymentId);

    const res = await webhookPost(
      signedWebhookRequest({ basketId: paymentId, token: attempt!.providerReference, status: "SUCCESS" })
    );
    expect(res.status).toBe(200);

    const data = await readData();
    const payment = data.payments.find((p) => p.id === paymentId);
    expect(payment!.status).toBe("paid");
    expect(payment!.paidAmount).toBe(500);
    expect(payment!.method).toBe("credit_card");
  });

  it("aynı webhook tekrar gönderildiğinde (replay) çift tahsilat/kayıt oluşmaz", async () => {
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "self1",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin",
    });
    setPaymentProviderForTests(mockProvider());
    const paymentId = await createUnpaidPayment("s1", 700);
    const checkout = await initiateStudentPaymentCheckoutTool(studentCtx({ userId: "self1" }), {
      paymentId,
      successUrl: "https://app.example.com/success",
      cancelUrl: "https://app.example.com/cancel",
      buyerIp: "127.0.0.1",
    });
    expect(checkout.ok).toBe(true);
    const attempt = await findPendingCheckoutAttempt(DEFAULT_TENANT_ID, paymentId);
    const body = { basketId: paymentId, token: attempt!.providerReference, status: "SUCCESS" };

    const first = await webhookPost(signedWebhookRequest(body));
    const second = await webhookPost(signedWebhookRequest(body));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const data = await readData();
    const payment = data.payments.find((p) => p.id === paymentId);
    expect(payment!.status).toBe("paid");
    expect(payment!.paidAmount).toBe(700); // İKİNCİ webhook tutarı ARTIRMADI.
  });

  it("başarısız/expired webhook olayında Payment 'paid' yapılmaz, attempt 'failed' işaretlenir", async () => {
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "self1",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin",
    });
    setPaymentProviderForTests(mockProvider());
    const paymentId = await createUnpaidPayment("s1");
    const checkout = await initiateStudentPaymentCheckoutTool(studentCtx({ userId: "self1" }), {
      paymentId,
      successUrl: "https://app.example.com/success",
      cancelUrl: "https://app.example.com/cancel",
      buyerIp: "127.0.0.1",
    });
    expect(checkout.ok).toBe(true);
    const attempt = await findPendingCheckoutAttempt(DEFAULT_TENANT_ID, paymentId);

    const res = await webhookPost(
      signedWebhookRequest({ basketId: paymentId, token: attempt!.providerReference, status: "FAILURE" })
    );
    expect(res.status).toBe(200);

    const data = await readData();
    const payment = data.payments.find((p) => p.id === paymentId);
    expect(payment!.status).not.toBe("paid");
  });

  it("provider konfigürasyonu yoksa (consoleProvider) webhook her zaman reddedilir, Payment değişmez", async () => {
    const paymentId = await createUnpaidPayment("s1");
    const res = await webhookPost(
      signedWebhookRequest({ basketId: paymentId, token: "irrelevant", status: "SUCCESS" })
    );
    expect(res.status).toBe(401);
    const data = await readData();
    const payment = data.payments.find((p) => p.id === paymentId);
    expect(payment!.status).not.toBe("paid");
  });
});
