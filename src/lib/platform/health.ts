import { STORE_MODE, isDbMode } from "../config";
import { isPlatformEncryptionConfigured } from "./secrets";
import { listPlatformAudit, listPlatformTenants } from "./store";
import { INTEGRATION_CATALOG } from "./integrations";

export type HealthCard = {
  id: string;
  label: string;
  status: "ok" | "warn" | "error";
  detail: string;
};

function hasEnv(keys: string[]): boolean {
  return keys.some((k) => typeof process.env[k] === "string" && process.env[k]!.trim().length > 0);
}

export async function collectHealthCards(): Promise<HealthCard[]> {
  const cards: HealthCard[] = [];

  cards.push({
    id: "store",
    label: "Veri katmanı",
    status: "ok",
    detail: `STORE_MODE=${STORE_MODE}`,
  });

  if (isDbMode) {
    try {
      const { getPrisma } = await import("../db");
      const prisma = getPrisma();
      await prisma.tenant.count();
      cards.push({ id: "db", label: "PostgreSQL", status: "ok", detail: "Bağlantı doğrulandı" });
    } catch {
      cards.push({ id: "db", label: "PostgreSQL", status: "error", detail: "Bağlantı kurulamadı" });
    }
  } else {
    cards.push({
      id: "db",
      label: "PostgreSQL",
      status: "warn",
      detail: "json/memory modunda atlandı — gerçek izolasyon yalnız db modunda",
    });
  }

  const jwtOk = Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16);
  cards.push({
    id: "jwt",
    label: "JWT",
    status: jwtOk || process.env.NODE_ENV !== "production" ? "ok" : "error",
    detail: jwtOk ? "JWT_SECRET tanımlı" : "Geliştirme yedek sırrı (production'da JWT_SECRET zorunlu)",
  });

  const aiOn = hasEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY", "GROQ_API_KEY", "NVIDIA_NIM_API_KEY", "CEREBRAS_API_KEY"]);
  cards.push({
    id: "ai",
    label: "AI sağlayıcıları",
    status: aiOn ? "ok" : "warn",
    detail: aiOn ? "En az bir sağlayıcı anahtarı tanımlı" : "Anahtar yok — heuristic yedek kullanılır",
  });

  cards.push({
    id: "encryption",
    label: "Secret şifreleme",
    status: isPlatformEncryptionConfigured() ? "ok" : "warn",
    detail: isPlatformEncryptionConfigured()
      ? "PLATFORM_ENCRYPTION_KEY tanımlı"
      : "Anahtar yok — secret persist edilmez, env secret kullanılır",
  });

  const tenants = await listPlatformTenants();
  cards.push({
    id: "tenants",
    label: "Kurum kaydı",
    status: tenants.length > 0 ? "ok" : "warn",
    detail: `${tenants.length} kurum`,
  });

  const recent = await listPlatformAudit({ limit: 1 });
  cards.push({
    id: "audit",
    label: "Denetim izi",
    status: "ok",
    detail: recent[0] ? `Son kayıt ${recent[0].createdAt}` : "Henüz platform denetim kaydı yok",
  });

  const broken = INTEGRATION_CATALOG.filter((c) => !hasEnv(c.envKeys)).length;
  cards.push({
    id: "integrations",
    label: "Entegrasyon env",
    status: broken === INTEGRATION_CATALOG.length ? "warn" : "ok",
    detail: `${INTEGRATION_CATALOG.length - broken}/${INTEGRATION_CATALOG.length} sağlayıcı env ile yapılandırılmış`,
  });

  return cards;
}
