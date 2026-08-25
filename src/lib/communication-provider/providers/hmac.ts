/**
 * Jenerik HMAC-SHA256 webhook doğrulaması — belirli bir sağlayıcıya bağlı
 * DEĞİLDİR (birçok webhook sağlayıcısının kullandığı ortak desen: gövde
 * `HMAC-SHA256(secret, rawBody)`, header'da `sha256=<hex>` biçiminde
 * taşınır). `providerMessageId` ham gövdenin kendi HMAC'ı olarak türetilir
 * (gerçek bir sağlayıcı bağlandığında onun mesaj kimliği alanı kullanılacak
 * — bu yalnızca idempotency iskeletinin çalıştığını kanıtlamak için).
 */
import { createHmac, timingSafeEqual } from "crypto";
import { getCommunicationProviderConfig } from "../config";
import type { CommunicationProvider, CommunicationWebhookVerification } from "../types";

const SIGNATURE_PREFIX = "sha256=";

function computeSignature(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function hmacCommunicationProvider(): CommunicationProvider {
  return {
    name: "hmac",
    isConfigured(): boolean {
      return Boolean(getCommunicationProviderConfig().webhookSecret);
    },
    async verifyWebhook(input: { rawBody: string; signatureHeader: string | null }): Promise<CommunicationWebhookVerification> {
      const { webhookSecret } = getCommunicationProviderConfig();
      if (!webhookSecret) return { ok: false, error: "İletişim webhook sağlayıcısı yapılandırılmadı." };
      if (!input.signatureHeader?.startsWith(SIGNATURE_PREFIX)) {
        return { ok: false, error: "İmza header'ı eksik veya biçimsiz." };
      }
      const provided = input.signatureHeader.slice(SIGNATURE_PREFIX.length);
      const expected = computeSignature(webhookSecret, input.rawBody);
      if (!safeEqual(provided, expected)) {
        return { ok: false, error: "İmza doğrulanamadı." };
      }
      return { ok: true, providerMessageId: computeSignature(webhookSecret, input.rawBody), rawBody: input.rawBody };
    },
  };
}
