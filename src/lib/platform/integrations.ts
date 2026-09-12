import { uid } from "../utils";
import type { IntegrationConnection, IntegrationKind, JsonValue } from "./types";
import { listIntegrations, upsertIntegration } from "./store";
import { isPlatformEncryptionConfigured, last4, redactSecrets } from "./secrets";

export const INTEGRATION_CATALOG: {
  provider: string;
  kind: IntegrationKind;
  label: string;
  envKeys: string[];
}[] = [
  { provider: "netgsm", kind: "sms", label: "Netgsm SMS", envKeys: ["NETGSM_USER", "NETGSM_PASSWORD"] },
  { provider: "twilio", kind: "sms", label: "Twilio SMS", envKeys: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"] },
  { provider: "whatsapp_cloud", kind: "whatsapp", label: "WhatsApp Cloud", envKeys: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"] },
  { provider: "smtp", kind: "email", label: "SMTP e-posta", envKeys: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] },
  { provider: "iyzico", kind: "payments", label: "iyzico", envKeys: ["IYZICO_API_KEY", "IYZICO_SECRET_KEY"] },
  { provider: "gemini", kind: "ai", label: "Google Gemini", envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"] },
  { provider: "groq", kind: "ai", label: "Groq", envKeys: ["GROQ_API_KEY"] },
  { provider: "nvidia_nim", kind: "ai", label: "NVIDIA NIM", envKeys: ["NVIDIA_NIM_API_KEY"] },
  { provider: "cerebras", kind: "ai", label: "Cerebras", envKeys: ["CEREBRAS_API_KEY"] },
];

function envConfigured(keys: string[]): boolean {
  return keys.some((k) => typeof process.env[k] === "string" && process.env[k]!.trim().length > 0);
}

export type PublicIntegration = Omit<IntegrationConnection, never> & {
  label: string;
  envConfigured: boolean;
  encryptionAvailable: boolean;
};

export function toPublicIntegration(
  row: IntegrationConnection,
  label: string,
  envKeys: string[]
): PublicIntegration {
  return {
    ...row,
    config: redactSecrets(row.config),
    label,
    envConfigured: envConfigured(envKeys),
    encryptionAvailable: isPlatformEncryptionConfigured(),
  };
}

export async function listPublicIntegrations(scopeType: "platform" | "tenant", scopeId: string): Promise<PublicIntegration[]> {
  const stored = await listIntegrations(scopeType, scopeId);
  const byProvider = new Map(stored.map((s) => [s.provider, s]));
  const now = new Date().toISOString();
  return INTEGRATION_CATALOG.map((cat) => {
    const existing = byProvider.get(cat.provider);
    if (existing) return toPublicIntegration(existing, cat.label, cat.envKeys);
    const envOn = envConfigured(cat.envKeys);
    const synthetic: IntegrationConnection = {
      id: `intg_${cat.provider}`,
      scopeType,
      scopeId,
      provider: cat.provider,
      kind: cat.kind,
      status: envOn ? "configured" : "not_configured",
      lastVerifiedAt: null,
      secretLast4: null,
      secretStored: false,
      config: {},
      updatedAt: now,
      updatedBy: "system",
    };
    return toPublicIntegration(synthetic, cat.label, cat.envKeys);
  });
}

export async function saveIntegrationConfig(input: {
  scopeType: "platform" | "tenant";
  scopeId: string;
  provider: string;
  config: Record<string, JsonValue>;
  secret?: string;
  actorUserId: string;
}): Promise<{ public: PublicIntegration; storedSecret: boolean; encryptionMissing: boolean }> {
  const cat = INTEGRATION_CATALOG.find((c) => c.provider === input.provider);
  if (!cat) {
    throw new Error("unknown_provider");
  }
  let secretLast4: string | null = null;
  const secretStored = false;
  let encryptionMissing = false;
  if (input.secret && input.secret.trim()) {
    // Dürüst durum: ciphertext bu sürümde HİÇBİR yere yazılmaz; "saklandı"
    // iddiası yapılmaz (secretStored=false). Gerçek credential env'de kalır.
    // Şifreleme anahtarı yoksa bunu ayrıca bildiririz.
    encryptionMissing = !isPlatformEncryptionConfigured();
    secretLast4 = last4(input.secret);
  }
  const now = new Date().toISOString();
  const safeConfig = redactSecrets(input.config);
  const row: IntegrationConnection = {
    id: uid("intg"),
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    provider: input.provider,
    kind: cat.kind,
    // Kaydedilmemiş bir secret entegrasyonu "yapılandırılmış" yapmaz.
    status: envConfigured(cat.envKeys) ? "configured" : "not_configured",
    lastVerifiedAt: null,
    secretLast4,
    secretStored,
    config: safeConfig,
    updatedAt: now,
    updatedBy: input.actorUserId,
  };
  const saved = await upsertIntegration(row);
  return {
    public: toPublicIntegration(saved, cat.label, cat.envKeys),
    storedSecret: secretStored,
    encryptionMissing,
  };
}

export async function testIntegrationConnection(input: {
  scopeType: "platform" | "tenant";
  scopeId: string;
  provider: string;
  actorUserId: string;
}): Promise<PublicIntegration> {
  const cat = INTEGRATION_CATALOG.find((c) => c.provider === input.provider);
  if (!cat) throw new Error("unknown_provider");
  const list = await listPublicIntegrations(input.scopeType, input.scopeId);
  const current = list.find((i) => i.provider === input.provider)!;
  // Gerçek sağlayıcı çağrısı YAPILMAZ (no real SMS/e-posta/ödeme). Yalnız
  // env yapılandırması kontrol edilir; "connected" asla iddia edilmez.
  const ok = current.envConfigured;
  const now = new Date().toISOString();
  const saved = await upsertIntegration({
    ...current,
    status: ok ? "configured" : "not_configured",
    lastVerifiedAt: now,
    updatedAt: now,
    updatedBy: input.actorUserId,
  });
  return toPublicIntegration(saved, cat.label, cat.envKeys);
}
