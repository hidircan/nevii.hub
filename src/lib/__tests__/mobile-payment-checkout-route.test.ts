import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { POST, MOBILE_PAYMENT_RESULT_SCHEME } from "../../app/api/v1/mobile/payments/[paymentId]/checkout/route";
import { POST as loginPost } from "../../app/api/v1/auth/login/route";
import { addPayment, readData } from "../store";
import {
  STUDENT_PORTAL_ACCESS_FILE,
  grantActiveStudentPortalAccess,
} from "../student-portal-access";
import {
  PAYMENT_CHECKOUT_ATTEMPTS_FILE,
  findPendingCheckoutAttempt,
} from "../payment-checkout";
import { setPaymentProviderForTests } from "../payment-provider/provider-factory";
import type { PaymentCheckoutInput, PaymentProvider } from "../payment-provider/types";
import { __resetRateLimitForTests } from "../rate-limit";

const T = DEFAULT_TENANT_ID;

let captured: PaymentCheckoutInput | null = null;

function mockProvider(): PaymentProvider {
  return {
    name: "mock-mobile-checkout",
    isConfigured: () => true,
    async createCheckout(input) {
      captured = input;
      return { ok: true, checkoutUrl: `https://mock-provider.test/pay/${input.paymentId}`, providerReference: "ref-mock-1" };
    },
    async verifyWebhook() {
      return { ok: false, error: "not used" };
    },
  };
}

async function loginAsStudent() {
  const res = await loginPost(
    new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ogrenci@email.com", password: "demo-student" }),
    })
  );
  const json = (await res.json()) as { ok: boolean; data: { accessToken: string } };
  expect(json.ok).toBe(true);
  return json.data.accessToken;
}

async function createUnpaidPayment(studentId: string, amount = 1000): Promise<string> {
  const before = await readData();
  const ids = new Set(before.payments.map((p) => p.id));
  const after = await addPayment({ studentId, description: "Mobil checkout test ödemesi", amount, dueDate: new Date().toISOString() });
  const created = after.payments.find((p) => !ids.has(p.id));
  if (!created) throw new Error("test setup: payment not created");
  createdPaymentIds.add(created.id);
  return created.id;
}

function checkoutReq(paymentId: string, accessToken?: string) {
  return new Request(`http://localhost/api/v1/mobile/payments/${paymentId}/checkout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: "{}",
  });
}

const createdPaymentIds = new Set<string>();

beforeEach(async () => {
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  await fs.rm(PAYMENT_CHECKOUT_ATTEMPTS_FILE, { force: true });
  setPaymentProviderForTests(null);
  captured = null;
  __resetRateLimitForTests();
});

// Paylaşılan store'da kalıntı BIRAKMA: oluşturulan test ödemeleri geri
// alınır; erişim/deneme dosyaları silinir; sahte provider sıfırlanır.
afterEach(async () => {
  if (createdPaymentIds.size > 0) {
    try {
      const { writeData } = await import("../store-json");
      const data = await readData();
      await writeData({ ...data, payments: data.payments.filter((p) => !createdPaymentIds.has(p.id)) });
    } catch {
      // store yoksa zaten temiz
    }
    createdPaymentIds.clear();
  }
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  await fs.rm(PAYMENT_CHECKOUT_ATTEMPTS_FILE, { force: true });
  setPaymentProviderForTests(null);
});

describe("POST /api/v1/mobile/payments/:paymentId/checkout", () => {
  it("dönüş URL'leri sunucu-sabit deep-link (client body'sinden okunmaz, open-redirect YOK)", async () => {
    const token = await loginAsStudent();
    await grantActiveStudentPortalAccess({ tenantId: T, userId: "user_student_s1", studentId: "s1", accessType: "SELF", invitedBy: "test" });
    setPaymentProviderForTests(mockProvider());
    const paymentId = await createUnpaidPayment("s1");

    const res = await POST(checkoutReq(paymentId, token), { params: { paymentId } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { checkoutUrl: string } };
    expect(json.ok).toBe(true);
    expect(json.data.checkoutUrl).toMatch(/^https:\/\/mock-provider\.test\//);
    expect(captured?.successUrl).toBe(`${MOBILE_PAYMENT_RESULT_SCHEME}?status=success&paymentId=${encodeURIComponent(paymentId)}`);
    expect(captured?.cancelUrl).toBe(`${MOBILE_PAYMENT_RESULT_SCHEME}?status=cancelled&paymentId=${encodeURIComponent(paymentId)}`);
    expect(captured?.successUrl).not.toContain("http");
    // Kötü niyetli body yoksayılır: idempotent yeniden kullanım AYNI checkout
    // URL'ini döner, sağlayıcıya yeni (evil) dönüş URL'li işlem AÇILMAZ.
    const firstUrl = json.data.checkoutUrl;
    const evil = await POST(
      new Request(`http://localhost/api/v1/mobile/payments/${paymentId}/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ successUrl: "https://evil.test/", cancelUrl: "https://evil.test/" }),
      }),
      { params: { paymentId } }
    );
    expect(evil.status).toBe(200);
    const evilJson = (await evil.json()) as { ok: boolean; data: { checkoutUrl: string } };
    expect(evilJson.data.checkoutUrl).toBe(firstUrl);
    expect(captured?.successUrl).toBe(`${MOBILE_PAYMENT_RESULT_SCHEME}?status=success&paymentId=${encodeURIComponent(paymentId)}`);
  });

  it("sağlayıcı yapılandırılmadıysa fail-closed (CONFLICT, deneme kaydı YOK)", async () => {
    const token = await loginAsStudent();
    await grantActiveStudentPortalAccess({ tenantId: T, userId: "user_student_s1", studentId: "s1", accessType: "SELF", invitedBy: "test" });
    const paymentId = await createUnpaidPayment("s1");

    const res = await POST(checkoutReq(paymentId, token), { params: { paymentId } });
    const json = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CONFLICT");
    expect(await findPendingCheckoutAttempt(T, paymentId)).toBeNull();
  });

  it("başkasının ödemesinde FORBIDDEN (IDOR kapalı)", async () => {
    const token = await loginAsStudent();
    await grantActiveStudentPortalAccess({ tenantId: T, userId: "user_student_s1", studentId: "s1", accessType: "SELF", invitedBy: "test" });
    setPaymentProviderForTests(mockProvider());
    const otherId = await createUnpaidPayment("s2");

    const res = await POST(checkoutReq(otherId, token), { params: { paymentId: otherId } });
    const json = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("token yoksa 401", async () => {
    const res = await POST(checkoutReq("whatever"), { params: { paymentId: "whatever" } });
    expect(res.status).toBe(401);
  });
});
