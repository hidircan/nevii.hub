/**
 * iyzico Hosted Checkout Form entegrasyonu. Kart/CVV verisi HİÇBİR ZAMAN bu
 * koda veya NotaPlan sunucularına ulaşmaz — yalnızca iyzico'nun barındırdığı
 * ödeme sayfasının URL'i alınıp kullanıcı oraya yönlendirilir.
 *
 * Bu dosyadaki istek imzalama (IYZWSv2/HMACSHA256) ve webhook doğrulama
 * (X-IYZ-SIGNATURE-V3) algoritmaları iyzico'nun GÜNCEL RESMİ dokümantasyonundan
 * doğrulandı (docs.iyzico.com/en/getting-started/preliminaries/authentication/hmacsha256-auth,
 * docs.iyzico.com/en/payment-methods/checkoutform/cf-implementation/cf-initialize,
 * docs.iyzico.com/en/advanced/webhook — Ağustos 2026) — tahmine dayalı DEĞİL.
 *
 * ÖNEMLİ — SANDBOX'A KARŞI ÇALIŞTIRILMADI: bu ortamda gerçek bir iyzico
 * sandbox API key/secret'ı yok, bu yüzden adapter gerçek bir HTTP isteğiyle
 * hiç doğrulanmadı (yalnızca dokümantasyona göre yazıldı + birim testleriyle
 * imza algoritmasının doğruluğu ayrıca doğrulandı). Canlıya almadan önce
 * MUTLAKA iyzico sandbox ortamında uçtan uca test edilmeli — bkz. final rapor
 * "Bilinen riskler". `isConfigured()` false olduğu sürece (env değişkenleri
 * yoksa) bu kod hiçbir gerçek HTTP çağrısı yapmaz.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { getPaymentProviderConfig } from "../config";
import type { PaymentCheckoutInput, PaymentCheckoutResult, PaymentProvider, PaymentWebhookVerification } from "../types";

const CF_INITIALIZE_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom";

function randomKey(): string {
  return String(Date.now()) + Math.random().toString(36).slice(2, 12);
}

/**
 * IYZWSv2 imza — docs.iyzico.com HMACSHA256 Auth:
 * 1) encryptedData = HMAC-SHA256(secretKey, randomKey + uriPath + requestBody) → hex
 * 2) authorizationParams = "apiKey:{apiKey}&randomKey:{randomKey}&signature:{encryptedData}"
 * 3) header = "IYZWSv2 " + Base64(authorizationParams)
 * (`x-iyzi-rnd` header'ı AYRICA aynı randomKey ile gönderilir.)
 */
export function iyzwsV2AuthorizationHeader(
  apiKey: string,
  secretKey: string,
  rnd: string,
  uriPath: string,
  body: string
): string {
  const encryptedData = createHmac("sha256", secretKey).update(rnd + uriPath + body, "utf8").digest("hex");
  const authorizationParams = `apiKey:${apiKey}&randomKey:${rnd}&signature:${encryptedData}`;
  return `IYZWSv2 ${Buffer.from(authorizationParams, "utf8").toString("base64")}`;
}

/**
 * X-IYZ-SIGNATURE-V3 — docs.iyzico.com Webhook:
 * key = secretKey + iyziEventType + iyziPaymentId + token + paymentConversationId + status
 * signature = HMAC-SHA256(secretKey, key) → hex
 */
export function iyzicoWebhookSignatureV3(
  secretKey: string,
  fields: { iyziEventType: string; iyziPaymentId: string; token: string; paymentConversationId: string; status: string }
): string {
  const key =
    secretKey + fields.iyziEventType + fields.iyziPaymentId + fields.token + fields.paymentConversationId + fields.status;
  return createHmac("sha256", secretKey).update(key, "utf8").digest("hex");
}

export function iyzicoProvider(): PaymentProvider {
  const cfg = getPaymentProviderConfig();

  return {
    name: "iyzico",
    isConfigured(): boolean {
      return Boolean(cfg.iyzicoApiKey && cfg.iyzicoSecretKey);
    },

    async createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
      if (!this.isConfigured()) {
        return { ok: false, error: "iyzico yapılandırılmadı.", errorCode: "NOT_CONFIGURED" };
      }

      // iyzico "price" alanı ondalık string bekler; Payment.amount projede
      // kuruş/TL karışık kullanılmıyor (bkz. types.ts yorumu) — tam sayı TL
      // olarak kabul edilir.
      const priceStr = input.amount.toFixed(2);

      const requestBody = {
        locale: "tr",
        conversationId: input.idempotencyKey,
        price: priceStr,
        paidPrice: priceStr,
        currency: input.currency || "TRY",
        basketId: input.paymentId,
        paymentGroup: "PRODUCT",
        callbackUrl: input.successUrl,
        enabledInstallments: [1],
        buyer: {
          id: input.buyer.id,
          name: input.buyer.name,
          surname: input.buyer.surname,
          gsmNumber: input.buyer.phone,
          email: input.buyer.email,
          identityNumber: "11111111111",
          registrationAddress: input.buyer.addressLine,
          ip: input.buyer.ip,
          city: input.buyer.city,
          country: input.buyer.country,
        },
        shippingAddress: {
          contactName: `${input.buyer.name} ${input.buyer.surname}`,
          city: input.buyer.city,
          country: input.buyer.country,
          address: input.buyer.addressLine,
        },
        billingAddress: {
          contactName: `${input.buyer.name} ${input.buyer.surname}`,
          city: input.buyer.city,
          country: input.buyer.country,
          address: input.buyer.addressLine,
        },
        basketItems: [
          {
            id: input.paymentId,
            price: priceStr,
            name: input.description.slice(0, 100) || "Ders ücreti",
            category1: "Eğitim",
            itemType: "VIRTUAL",
          },
        ],
      };

      const bodyJson = JSON.stringify(requestBody);
      const rnd = randomKey();
      const authorization = iyzwsV2AuthorizationHeader(cfg.iyzicoApiKey, cfg.iyzicoSecretKey, rnd, CF_INITIALIZE_PATH, bodyJson);

      try {
        const res = await fetch(`${cfg.iyzicoBaseUrl}${CF_INITIALIZE_PATH}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authorization,
            "x-iyzi-rnd": rnd,
          },
          body: bodyJson,
        });
        const json = (await res.json()) as {
          status?: string;
          token?: string;
          checkoutFormContent?: string;
          paymentPageUrl?: string;
          errorMessage?: string;
          errorCode?: string;
        };

        if (json.status !== "success" || !json.token) {
          return {
            ok: false,
            error: json.errorMessage || "iyzico checkout başlatılamadı.",
            errorCode: json.errorCode || "PROVIDER_ERROR",
          };
        }
        if (!json.paymentPageUrl) {
          // iyzico bu entegrasyon modunda checkoutFormContent (gömülü script)
          // dönebilir, paymentPageUrl değil — biz yalnızca tam sayfa
          // yönlendirmesini (hosted redirect) destekliyoruz; paymentPageUrl
          // yoksa fail-closed (sahte/tahmini bir URL ASLA üretilmez).
          return {
            ok: false,
            error: "iyzico yanıtında paymentPageUrl yok (yalnızca embed formu döndü) — hosted redirect desteklenmiyor.",
            errorCode: "UNSUPPORTED_RESPONSE_SHAPE",
          };
        }

        return { ok: true, checkoutUrl: json.paymentPageUrl, providerReference: json.token };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "iyzico bağlantı hatası.",
          errorCode: "NETWORK_ERROR",
        };
      }
    },

    /**
     * iyzico webhook (HPP format) gövdesi:
     * { paymentConversationId, merchantId, token, status, iyziReferenceCode,
     *   iyziEventType, iyziEventTime, iyziPaymentId }
     * İmza: header `X-IYZ-SIGNATURE-V3`, doğrulama yalnızca gövde alanlarının
     * KENDİSİYLE (ham body HMAC'ı DEĞİL) hesaplanır — bkz. dosya başı yorumu.
     */
    async verifyWebhook(input: { rawBody: string; signatureHeader: string | null }): Promise<PaymentWebhookVerification> {
      if (!cfg.iyzicoWebhookSecret) {
        return { ok: false, error: "iyzico webhook secret yapılandırılmadı." };
      }
      if (!input.signatureHeader) {
        return { ok: false, error: "X-IYZ-SIGNATURE-V3 header'ı eksik." };
      }

      let payload: {
        paymentConversationId?: string;
        token?: string;
        status?: string;
        iyziEventType?: string;
        iyziPaymentId?: string;
      };
      try {
        payload = JSON.parse(input.rawBody);
      } catch {
        return { ok: false, error: "Webhook gövdesi ayrıştırılamadı." };
      }

      const { paymentConversationId, token, status, iyziEventType, iyziPaymentId } = payload;
      if (!token || !status || !iyziEventType || !iyziPaymentId || !paymentConversationId) {
        return { ok: false, error: "Webhook gövdesinde zorunlu alan(lar) eksik." };
      }

      const expected = iyzicoWebhookSignatureV3(cfg.iyzicoWebhookSecret, {
        iyziEventType,
        iyziPaymentId,
        token,
        paymentConversationId,
        status,
      });
      const expectedBuf = Buffer.from(expected, "hex");
      const receivedBuf = Buffer.from(input.signatureHeader.trim(), "hex");
      if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
        return { ok: false, error: "Webhook imzası (X-IYZ-SIGNATURE-V3) geçersiz." };
      }

      // Yalnızca bizim başlattığımız Checkout Form akışının event'ini işleriz —
      // başka event türleri (BKM/abonelik/vb.) sessizce reddedilir.
      if (iyziEventType !== "CHECKOUT_FORM_AUTH") {
        return { ok: false, error: `Desteklenmeyen iyziEventType: ${iyziEventType}` };
      }

      return {
        ok: true,
        paymentId: "",
        providerReference: token,
        status: status === "SUCCESS" ? "paid" : "failed",
      };
    },
  };
}
