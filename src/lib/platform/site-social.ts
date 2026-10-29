import { z } from "zod";
import { fail, ok } from "../services/result";
import type { ServiceContext } from "../services/context";
import { PLATFORM_TENANT_ID } from "../auth/config";
import { requireHyperAdmin } from "./access";
import { PLATFORM_SCOPE_ID, recordPublishedVersion } from "./policy-version-log";
import { appendPlatformAudit, listSettingOverrides, upsertSettingOverride } from "./store";

/**
 * Herkese açık sitenin sosyal medya bağlantıları.
 *
 * - Etiketler kodda sabittir (`SITE_CONTACT.social`); URL'ler BURADA,
 *   platform ayar deposunda (`platform` / `*` / `site.social`) tutulur.
 * - Yalnız HYPER_ADMIN yazabilir; her kayıt audit + sürüm izi bırakır.
 * - Boş değer = "yakında" rozeti (kırık link üretilmez).
 * - Yalnız https URL kabul edilir (open-redirect/javascript: kapalı).
 */
export const SITE_SOCIAL_KEY = "site.social";

export const SITE_SOCIAL_NETWORKS = ["youtube", "instagram", "linkedin", "x", "tiktok"] as const;
export type SiteSocialNetwork = (typeof SITE_SOCIAL_NETWORKS)[number];

export const SITE_SOCIAL_LABELS: Record<SiteSocialNetwork, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
  tiktok: "TikTok",
};

export type SiteSocialLinks = Record<SiteSocialNetwork, string | null>;

const EMPTY: SiteSocialLinks = { youtube: null, instagram: null, linkedin: null, x: null, tiktok: null };

function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.length > 300) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  return u.toString();
}

/** Herkese açık okuma — yetki istemez, yalnız URL listesi döner. */
export async function getSiteSocial(): Promise<SiteSocialLinks> {
  const row = (await listSettingOverrides({ tenantId: PLATFORM_TENANT_ID })).find(
    (o) => o.scopeType === "platform" && o.scopeId === "*" && o.key === SITE_SOCIAL_KEY
  );
  const v = (row?.value ?? {}) as Partial<Record<SiteSocialNetwork, unknown>>;
  const out: SiteSocialLinks = { ...EMPTY };
  for (const n of SITE_SOCIAL_NETWORKS) {
    const norm = normalizeUrl(v[n]);
    // Kayıtlı bozuk değer yayına SIZMAZ (yakında rozetine düşer).
    out[n] = typeof v[n] === "string" && (v[n] as string).trim() ? norm : null;
  }
  return out;
}

const inputSchema = z.object({
  youtube: z.string().max(300).nullable().optional(),
  instagram: z.string().max(300).nullable().optional(),
  linkedin: z.string().max(300).nullable().optional(),
  x: z.string().max(300).nullable().optional(),
  tiktok: z.string().max(300).nullable().optional(),
});

export async function getSiteSocialMeta(ctx: ServiceContext) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  return ok({ links: await getSiteSocial(), networks: SITE_SOCIAL_NETWORKS, labels: SITE_SOCIAL_LABELS });
}

export async function setSiteSocial(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz sosyal medya yükü.");
  const next: SiteSocialLinks = { ...EMPTY };
  for (const n of SITE_SOCIAL_NETWORKS) {
    const raw = parsed.data[n];
    if (raw === null || raw === undefined || raw.trim() === "") {
      next[n] = null;
      continue;
    }
    const norm = normalizeUrl(raw);
    if (!norm) {
      return fail("VALIDATION_ERROR", `${SITE_SOCIAL_LABELS[n]} adresi geçersiz; https ile başlayan tam adres girin.`);
    }
    next[n] = norm;
  }
  const before = await getSiteSocial();
  const now = new Date().toISOString();
  await upsertSettingOverride({
    scopeType: "platform",
    scopeId: "*",
    key: SITE_SOCIAL_KEY,
    value: { ...next, updatedAt: now, updatedBy: ctx.userId },
    updatedAt: now,
    updatedBy: ctx.userId,
  });
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: null,
    action: "site.social.update",
    entityType: "SiteSocial",
    entityId: SITE_SOCIAL_KEY,
    before: before as never,
    after: next as never,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
  await recordPublishedVersion(ctx, PLATFORM_SCOPE_ID, SITE_SOCIAL_KEY, next, { reason: "Sosyal medya güncellendi" });
  return ok({ links: next });
}
