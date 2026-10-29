/**
 * Kurum bilgisi + kariyer sayfası adresi (slug) çözümleme.
 * db modunda `Tenant.slug` tek kaynak; json/memory modunda platform deposundaki slug, yoksa tenantId kullanılır.
 * Herkese açık uçlar tenantId'yi ASLA istemciden almaz — yalnız slug'dan burada çözer.
 */
import { isDbMode } from "../config";
import { runWithTenantAsync } from "../tenant-context";
import type { InstitutionInfo } from "./emails";

export function slugify(input: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", i: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
  return input
    .toLocaleLowerCase("tr")
    .replace(/[çğıiöşüâîû]/g, (c) => map[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function getInstitutionInfo(tenantId: string): Promise<InstitutionInfo> {
  try {
    // db: yalnız bu 5 alan (DB egress — tam readData ~1.8 MB idi; School.tenantId tekil). Okul satırı
    // yoksa readData'nın tohumlama davranışı aynen korunur.
    const school = isDbMode
      ? await (await import("../db")).prisma.school.findUnique({
          where: { tenantId },
          select: { name: true, logoUrl: true, phone: true, email: true, website: true },
        })
      : null;
    const { readData } = await import("../store");
    const s = school ?? (await runWithTenantAsync(tenantId, () => readData())).settings;
    return { name: s.name || "Kurum", logoUrl: s.logoUrl || undefined, phone: s.phone || undefined, email: s.email || undefined, website: s.website || undefined };
  } catch {
    return { name: "Kurum" };
  }
}

export type CareerTenant = { tenantId: string; name: string; slug: string };

export async function resolveCareerTenant(slug: string): Promise<CareerTenant | null> {
  const clean = slug.trim().toLowerCase().slice(0, 100);
  if (!clean || !/^[a-z0-9_-]+$/.test(clean)) return null;
  if (isDbMode) {
    const { prisma } = await import("../db");
    const t = await prisma.tenant.findFirst({
      where: { OR: [{ slug: clean }, { id: clean }], active: true },
      select: { id: true, name: true, slug: true },
    });
    return t ? { tenantId: t.id, name: t.name, slug: t.slug } : null;
  }
  try {
    const { findTenantBySlug } = await import("../platform/store");
    const p = await findTenantBySlug(clean);
    if (p && p.active) return { tenantId: p.tenantId, name: p.name, slug: p.slug };
  } catch {
    // platform deposu yoksa aşağıdaki yola düş
  }
  const { listTenants } = await import("../store");
  const all = await listTenants();
  // İsimden slug türetme YOK: aynı adlı iki kurumda başvuru yanlış kuruma düşebilirdi.
  const hit = all.find((t) => t.tenantId.toLowerCase() === clean);
  return hit ? { tenantId: hit.tenantId, name: hit.name, slug: clean } : null;
}

export async function careerSlugForTenant(tenantId: string): Promise<string> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    return t?.slug || tenantId;
  }
  try {
    const { getPlatformTenant } = await import("../platform/store");
    const p = await getPlatformTenant(tenantId);
    if (p?.slug) return p.slug;
  } catch {
    // yoksay
  }
  return tenantId;
}
