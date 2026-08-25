import { getCommunicationProviderConfig } from "./config";
import { hmacCommunicationProvider } from "./providers/hmac";
import type { CommunicationProvider, CommunicationWebhookVerification } from "./types";

let override: CommunicationProvider | null = null;

/** Testler için — gerçek bir provider'a asla bağlanmadan davranışı sahteler. */
export function setCommunicationProviderForTests(p: CommunicationProvider | null) {
  override = p;
}

function consoleProvider(): CommunicationProvider {
  return {
    name: "console",
    isConfigured: () => false,
    async verifyWebhook(): Promise<CommunicationWebhookVerification> {
      return { ok: false, error: "İletişim webhook sağlayıcısı henüz yapılandırılmadı." };
    },
  };
}

export function getCommunicationProvider(): CommunicationProvider {
  if (override) return override;
  const { provider } = getCommunicationProviderConfig();
  if (provider === "hmac") {
    const p = hmacCommunicationProvider();
    if (p.isConfigured()) return p;
  }
  return consoleProvider();
}
