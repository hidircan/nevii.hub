import { Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { apiGet } from "./client";
import type { MobilePersona } from "../auth/role-to-persona";

/**
 * Mobil policy + kurum markası tüketimi (Control Center 2026-09-28).
 *
 * Sunucu TEK yetkilidir: bu modül `GET /api/v1/mobile/policy` ve
 * `GET /api/v1/config/snapshot` yanıtlarını okur, kapı ekranına çevirir.
 * Yeniden açma/oturum yenilemede tazelenir; önbellek tenant+user
 * anahtarlıdır (başka kurumun kararı/markası ASLA gösterilmez) ve çıkışta
 * silinir. Önbellek yalnız çevrimdışıyken son bilinen kararı gösterir —
 * "çevrimdışı önbellek" diye etiketlenir, canlı gibi davranılmaz.
 */

export type MobilePolicy = {
  allowed: boolean;
  reasons: string[];
  platform: "ios" | "android" | null;
  maintenance: { active: boolean; message: string };
  minVersion: { ios: string; android: string };
  updateRequired: boolean;
  push: { policy: "disabled" | "allowed"; providerConfigured: boolean; active: boolean; note: string };
  contractVersion: number;
  configVersion: number;
};

export type InstitutionBrand = {
  name: string;
  logoUrl: string;
  colorPrimary: string;
  colorAccent: string;
  loginMessage: string;
};

export type PolicyGate = "ok" | "blocked" | "maintenance" | "update";

/** Sunucu kararından istemci kapısı — saf fonksiyon (test edilir). */
export function policyGateFor(policy: MobilePolicy): PolicyGate {
  if (!policy.allowed) return "blocked";
  if (policy.maintenance.active) return "maintenance";
  if (policy.updateRequired) return "update";
  return "ok";
}

export function currentAppVersion(): string {
  const v = Constants.expoConfig?.version;
  return typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v) ? v : "0.0.0";
}

export function currentPlatform(): "ios" | "android" {
  return Platform.OS === "android" ? "android" : "ios";
}

type CachedPolicy = {
  policy: MobilePolicy;
  brand: InstitutionBrand | null;
  configVersion: number;
  fetchedAt: string;
};

function cacheKey(tenantId: string, userId: string): string {
  return `notaplan_mobile_policy_${tenantId}_${userId}`;
}

export async function readCachedPolicy(tenantId: string, userId: string): Promise<CachedPolicy | null> {
  try {
    const raw = await SecureStore.getItemAsync(cacheKey(tenantId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPolicy;
    if (!parsed || typeof parsed !== "object" || !parsed.policy) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearCachedPolicy(tenantId: string, userId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(cacheKey(tenantId, userId));
  } catch {
    // önbellek temizliği en iyi çaba — oturum kapatma yine de tamamlanır
  }
}

export type PolicyRefresh = {
  policy: MobilePolicy;
  brand: InstitutionBrand | null;
  fromCache: boolean;
};

/**
 * Policy + markayı tazeler (oturum açılışında ve yenilemede çağrılır).
 * Ağ yoksa tenant-anahtarlı son kararı döndürür (fromCache=true).
 */
export async function refreshMobilePolicy(tenantId: string, userId: string): Promise<PolicyRefresh | null> {
  const platform = currentPlatform();
  const appVersion = currentAppVersion();
  const [policyRes, brandRes] = await Promise.all([
    apiGet<MobilePolicy>(`/api/v1/mobile/policy?platform=${platform}&appVersion=${encodeURIComponent(appVersion)}`),
    apiGet<{ branding: { institution: InstitutionBrand }; configVersion: number }>(
      `/api/v1/config/snapshot?tenantId=${encodeURIComponent(tenantId)}`
    ),
  ]);
  if (policyRes.ok) {
    const brand = brandRes.ok ? brandRes.data.branding.institution : null;
    const entry: CachedPolicy = {
      policy: policyRes.data,
      brand,
      configVersion: policyRes.data.configVersion,
      fetchedAt: new Date().toISOString(),
    };
    try {
      await SecureStore.setItemAsync(cacheKey(tenantId, userId), JSON.stringify(entry));
    } catch {
      // yazılamazsa canlı karar yine de döner
    }
    return { policy: policyRes.data, brand, fromCache: false };
  }
  const cached = await readCachedPolicy(tenantId, userId);
  if (cached) return { policy: cached.policy, brand: cached.brand, fromCache: true };
  return null;
}

/** Kapı ekranı metinleri — persona'ya göre kapanma nedeni. */
export function blockedCopyFor(persona: MobilePersona | null, reasons: string[]): { title: string; body: string } {
  const detail = reasons.length > 0 ? reasons.join(" ") : "Bu kurumda mobil erişim kapalı.";
  if (persona === "teacher") return { title: "Öğretmen mobil portalı kapalı", body: `${detail} Web panelini kullanabilirsiniz.` };
  if (persona === "admin") return { title: "Yönetici mobil portalı kapalı", body: `${detail} Web panelini kullanabilirsiniz.` };
  return { title: "Mobil erişim kapalı", body: `${detail} Kurumunuzla iletişime geçin.` };
}
