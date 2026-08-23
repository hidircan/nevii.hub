import { getPaymentProviderConfig } from "./config";
import { iyzicoProvider } from "./providers/iyzico";
import type { PaymentCheckoutInput, PaymentCheckoutResult, PaymentProvider, PaymentWebhookVerification } from "./types";

let override: PaymentProvider | null = null;

/** Testler için — gerçek bir provider'a asla bağlanmadan davranışı sahteler. */
export function setPaymentProviderForTests(p: PaymentProvider | null) {
  override = p;
}

function consoleProvider(): PaymentProvider {
  return {
    name: "console",
    isConfigured: () => false,
    async createCheckout(_input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
      return {
        ok: false,
        error: "Online ödeme sağlayıcısı henüz yapılandırılmadı.",
        errorCode: "NOT_CONFIGURED",
      };
    },
    async verifyWebhook(): Promise<PaymentWebhookVerification> {
      return { ok: false, error: "Online ödeme sağlayıcısı henüz yapılandırılmadı." };
    },
  };
}

/**
 * `stripe` implementasyonu henüz YOK. `iyzico` gerçek bir HTTP adapter'a
 * sahip (bkz. providers/iyzico.ts) ama SANDBOX'ta doğrulanmadı — kendi
 * `isConfigured()`'ı env değişkenleri (IYZICO_API_KEY/IYZICO_SECRET_KEY)
 * yoksa false döner, bu durumda fail-closed olarak `consoleProvider()`e
 * düşülür. Yanlışlıkla "yapılandırılmış" görünüp sahte bir checkout URL'i
 * ASLA üretilmez.
 */
export function getPaymentProvider(): PaymentProvider {
  if (override) return override;
  const { provider } = getPaymentProviderConfig();
  if (provider === "iyzico") {
    const p = iyzicoProvider();
    if (p.isConfigured()) return p;
  }
  return consoleProvider();
}
