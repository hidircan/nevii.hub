import { unstable_cache } from "next/cache";
import { PLATFORM_TENANT_ID } from "../auth/config";
import { isDbMode } from "../config";

/**
 * Ana sayfanın toplu sayıları: yalnız aktif kurumların TOPLAMI; ad, kurum ayrımı ve
 * kurum sayısı yok. Tek sorgu, sonuç saatte bir yenilenir: ziyaretçi sayısı veritabanı
 * yükünü artırmaz (günde en çok 24 COUNT, satır okunmaz). Okunamazsa bölüm hiç görünmez.
 */
export type SiteStats = { teachers: number; students: number; parents: number; admins: number; branches: number };

async function readStats(): Promise<SiteStats> {
  if (!isDbMode) {
    const { readReferenceData } = await import("../store");
    const data = await readReferenceData();
    return {
      teachers: data.teachers.filter((t) => t.active !== false).length,
      students: data.students.filter((s) => s.active !== false).length,
      parents: 0,
      admins: 0,
      branches: data.settings.branches?.length ?? 0,
    };
  }
  const { getPrisma } = await import("../db");
  const rows = await getPrisma().$queryRaw<{ teachers: bigint; students: bigint; parents: bigint; admins: bigint; branches: bigint }[]>`
    WITH t AS (SELECT "id" FROM "Tenant" WHERE "active" = true AND "id" <> ${PLATFORM_TENANT_ID})
    SELECT
      (SELECT COUNT(*) FROM "Teacher" WHERE "active" = true AND "deletedAt" IS NULL AND "archivedAt" IS NULL AND "tenantId" IN (SELECT "id" FROM t)) AS "teachers",
      (SELECT COUNT(*) FROM "Student" WHERE "active" = true AND "tenantId" IN (SELECT "id" FROM t)) AS "students",
      (SELECT COUNT(DISTINCT "userId") FROM "StudentPortalAccess" WHERE "accessType" = 'GUARDIAN' AND "status" = 'active' AND "tenantId" IN (SELECT "id" FROM t)) AS "parents",
      (SELECT COUNT(*) FROM "User" WHERE "role" IN ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'BRANCH_MANAGER') AND "active" = true AND "deletedAt" IS NULL AND "tenantId" IN (SELECT "id" FROM t)) AS "admins",
      (SELECT COUNT(*) FROM "Branch" WHERE "tenantId" IN (SELECT "id" FROM t)) AS "branches"`;
  const r = rows[0]!;
  return { teachers: Number(r.teachers), students: Number(r.students), parents: Number(r.parents), admins: Number(r.admins), branches: Number(r.branches) };
}

const cachedStats = unstable_cache(readStats, ["site-stats"], { revalidate: 3600 });

export async function getSiteStats(): Promise<SiteStats | null> {
  // Next çalışma ortamı dışında (test, script) unstable_cache hata verir: doğrudan okunur.
  const stats = await cachedStats().catch(() => readStats().catch(() => null));
  return stats && stats.students + stats.teachers > 0 ? stats : null;
}
