import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import { iyzicoProvider, iyzwsV2AuthorizationHeader, iyzicoWebhookSignatureV3 } from "../payment-provider/providers/iyzico";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("iyzico adapter — resmi doğrulanmış algoritmalar (docs.iyzico.com, Ağustos 2026)", () => {
  describe("IYZWSv2 istek imzası (HMACSHA256 Auth)", () => {
    it("HMAC-SHA256(secretKey, randomKey + uriPath + body) → hex, sonra base64(apiKey:...&randomKey:...&signature:...)", () => {
      const apiKey = "test-api-key";
      const secretKey = "test-secret-key";
      const rnd = "1234567890";
      const uriPath = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
      const body = '{"price":"100.00"}';

      const header = iyzwsV2AuthorizationHeader(apiKey, secretKey, rnd, uriPath, body);

      // Kendi hesaplamamızla (dokümantasyondaki formülü BİREBİR tekrar ederek) karşılaştır.
      const expectedSignature = createHmac("sha256", secretKey).update(rnd + uriPath + body, "utf8").digest("hex");
      const expectedParams = `apiKey:${apiKey}&randomKey:${rnd}&signature:${expectedSignature}`;
      const expectedHeader = `IYZWSv2 ${Buffer.from(expectedParams, "utf8").toString("base64")}`;

      expect(header).toBe(expectedHeader);
      expect(header.startsWith("IYZWSv2 ")).toBe(true);
    });

    it("farklı body/randomKey farklı imza üretir (deterministik ama girdiye duyarlı)", () => {
      const h1 = iyzwsV2AuthorizationHeader("k", "s", "r1", "/p", "{}");
      const h2 = iyzwsV2AuthorizationHeader("k", "s", "r2", "/p", "{}");
      expect(h1).not.toBe(h2);
    });
  });

  describe("X-IYZ-SIGNATURE-V3 webhook imzası", () => {
    it("key = secretKey+iyziEventType+iyziPaymentId+token+paymentConversationId+status → HMAC-SHA256 → hex", () => {
      const secretKey = "test-secret-key";
      const fields = {
        iyziEventType: "CHECKOUT_FORM_AUTH",
        iyziPaymentId: "pay-123",
        token: "tok-456",
        paymentConversationId: "conv-789",
        status: "SUCCESS",
      };
      const sig = iyzicoWebhookSignatureV3(secretKey, fields);
      const expected = createHmac("sha256", secretKey)
        .update(secretKey + fields.iyziEventType + fields.iyziPaymentId + fields.token + fields.paymentConversationId + fields.status, "utf8")
        .digest("hex");
      expect(sig).toBe(expected);
    });
  });

  it("env değişkenleri yoksa isConfigured() false döner ve createCheckout NOT_CONFIGURED ile fail-closed'dır", async () => {
    delete process.env.IYZICO_API_KEY;
    delete process.env.IYZICO_SECRET_KEY;
    const provider = iyzicoProvider();
    expect(provider.isConfigured()).toBe(false);

    const result = await provider.createCheckout({
      tenantId: "t1",
      paymentId: "p1",
      amount: 1000,
      currency: "TRY",
      description: "test",
      successUrl: "https://app.example.com/success",
      cancelUrl: "https://app.example.com/cancel",
      idempotencyKey: "k1",
      buyer: {
        id: "s1",
        name: "Test",
        surname: "Öğrenci",
        email: "a@b.com",
        phone: "05550000000",
        ip: "127.0.0.1",
        addressLine: "-",
        city: "İstanbul",
        country: "Turkey",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("NOT_CONFIGURED");
  });

  describe("webhook doğrulaması (X-IYZ-SIGNATURE-V3)", () => {
    beforeEach(() => {
      process.env.IYZICO_API_KEY = "test-api-key";
      process.env.IYZICO_SECRET_KEY = "test-secret-key";
      process.env.IYZICO_WEBHOOK_SECRET = "test-webhook-secret";
    });

    function signedBody(overrides: Partial<{ paymentConversationId: string; token: string; status: string; iyziEventType: string; iyziPaymentId: string }> = {}) {
      const payload = {
        paymentConversationId: "conv-1",
        token: "tok-123",
        status: "SUCCESS",
        iyziEventType: "CHECKOUT_FORM_AUTH",
        iyziPaymentId: "iyzi-pay-1",
        merchantId: "m1",
        iyziReferenceCode: "ref1",
        iyziEventTime: Date.now(),
        ...overrides,
      };
      const rawBody = JSON.stringify(payload);
      const signature = createHmac("sha256", "test-webhook-secret")
        .update(
          "test-webhook-secret" + payload.iyziEventType + payload.iyziPaymentId + payload.token + payload.paymentConversationId + payload.status,
          "utf8"
        )
        .digest("hex");
      return { rawBody, signature };
    }

    it("doğru X-IYZ-SIGNATURE-V3 imzalı CHECKOUT_FORM_AUTH/SUCCESS gövdesini kabul eder", async () => {
      const provider = iyzicoProvider();
      const { rawBody, signature } = signedBody();
      const result = await provider.verifyWebhook({ rawBody, signatureHeader: signature });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.providerReference).toBe("tok-123");
        expect(result.status).toBe("paid");
      }
    });

    it("status=FAILURE → status:'failed'", async () => {
      const provider = iyzicoProvider();
      const { rawBody, signature } = signedBody({ status: "FAILURE" });
      const result = await provider.verifyWebhook({ rawBody, signatureHeader: signature });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.status).toBe("failed");
    });

    it("yanlış secret ile üretilmiş imzayı reddeder", async () => {
      const provider = iyzicoProvider();
      const { rawBody } = signedBody();
      const wrongSig = createHmac("sha256", "WRONG-secret").update(rawBody, "utf8").digest("hex");
      const result = await provider.verifyWebhook({ rawBody, signatureHeader: wrongSig });
      expect(result.ok).toBe(false);
    });

    it("imzalanan alanlardan biri (status) değiştirilip imza değiştirilmezse (tamper) reddeder", async () => {
      // X-IYZ-SIGNATURE-V3 yalnızca 5 alanı imzalar (iyziEventType, iyziPaymentId,
      // token, paymentConversationId, status) — bu resmi algoritmanın kendisi,
      // bu test tam da BUNLARDAN birinin (status: FAILURE->SUCCESS) sahte
      // biçimde değiştirilmesini yakalıyor mu diye bakar.
      const provider = iyzicoProvider();
      const { signature } = signedBody({ status: "FAILURE" });
      const tamperedBody = JSON.stringify({
        paymentConversationId: "conv-1",
        token: "tok-123",
        status: "SUCCESS", // saldırgan FAILURE'ı SUCCESS'e çevirmeye çalıştı
        iyziEventType: "CHECKOUT_FORM_AUTH",
        iyziPaymentId: "iyzi-pay-1",
      });
      const result = await provider.verifyWebhook({ rawBody: tamperedBody, signatureHeader: signature });
      expect(result.ok).toBe(false);
    });

    it("imzalanmayan (ekstra) bir alan eklenmesi, imzalanan alanlar aynıysa geçerliliği bozmaz (resmi algoritma yalnız 5 alanı imzalar)", async () => {
      const provider = iyzicoProvider();
      const { rawBody, signature } = signedBody();
      const parsed = JSON.parse(rawBody);
      const withExtraField = JSON.stringify({ ...parsed, someUnsignedExtraField: "attacker-added" });
      const result = await provider.verifyWebhook({ rawBody: withExtraField, signatureHeader: signature });
      expect(result.ok).toBe(true);
    });

    it("imza header'ı eksikse reddeder", async () => {
      const provider = iyzicoProvider();
      const { rawBody } = signedBody();
      const result = await provider.verifyWebhook({ rawBody, signatureHeader: null });
      expect(result.ok).toBe(false);
    });

    it("desteklenmeyen iyziEventType (ör. BKM_AUTH) reddedilir", async () => {
      const provider = iyzicoProvider();
      const { rawBody, signature } = signedBody({ iyziEventType: "BKM_AUTH" });
      const result = await provider.verifyWebhook({ rawBody, signatureHeader: signature });
      expect(result.ok).toBe(false);
    });

    it("webhook secret yapılandırılmadıysa reddeder", async () => {
      delete process.env.IYZICO_WEBHOOK_SECRET;
      delete process.env.IYZICO_SECRET_KEY;
      process.env.IYZICO_API_KEY = "test-api-key";
      const provider = iyzicoProvider();
      const result = await provider.verifyWebhook({ rawBody: "{}", signatureHeader: "anything" });
      expect(result.ok).toBe(false);
    });
  });
});
