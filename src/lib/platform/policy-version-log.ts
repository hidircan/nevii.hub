import type { ServiceContext } from "../services/context";
import { listPolicyVersions, newPolicyVersionId, savePolicyVersion } from "./store-ext";
import type { JsonValue, PolicyVersion } from "./types";

/**
 * Sürümlenen kritik politikalar. Bu anahtarlara yapılan HER yayın (doğrudan
 * kayıt, taslak yayını, geri alma, sıfırlama) yeni bir `published` sürüm
 * üretir; önceki yayın `superseded` olur. Satır silinmez.
 */
export const FEATURES_POLICY_KEY = "features.overrides";
export const PLATFORM_SCOPE_ID = "platform";
/** Paket + modül + fiyat kataloğu — platform kapsamında tek sürümlü belge. */
export const COMMERCIAL_CATALOG_KEY = "commercial.catalog";

export function isGovernedPolicyKey(key: string): boolean {
  return (
    key.startsWith("appearance.") ||
    key.startsWith("subscription.") ||
    key.startsWith("mobile.") ||
    key.startsWith("policy.") ||
    key.startsWith("access.") ||
    key.startsWith("retention.") ||
    key === COMMERCIAL_CATALOG_KEY ||
    key === "forms.studentRegistration" ||
    key === FEATURES_POLICY_KEY ||
    key === "platform.logo"
  );
}

export async function recordPublishedVersion(
  ctx: ServiceContext,
  scopeId: string,
  key: string,
  value: JsonValue,
  opts?: { reason?: string; rollbackOfVersion?: number | null; fromDraftId?: string }
): Promise<PolicyVersion> {
  const history = await listPolicyVersions(scopeId, key);
  const now = new Date().toISOString();
  for (const prev of history.filter((h) => h.status === "published")) {
    await savePolicyVersion({ ...prev, status: "superseded" });
  }
  const draft = opts?.fromDraftId ? history.find((h) => h.id === opts.fromDraftId) : undefined;
  const next = Math.max(0, ...history.map((h) => h.version)) + 1;
  return savePolicyVersion({
    id: draft?.id ?? newPolicyVersionId(),
    scopeId,
    key,
    version: draft?.version ?? next,
    status: "published",
    value,
    reason: opts?.reason?.trim() || "Doğrudan kayıt",
    createdBy: draft?.createdBy ?? ctx.userId,
    createdAt: draft?.createdAt ?? now,
    publishedBy: ctx.userId,
    publishedAt: now,
    rollbackOfVersion: opts?.rollbackOfVersion ?? null,
  });
}
