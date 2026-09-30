import { fail, ok } from "../services/result";
import type { ServiceContext } from "../services/context";
import { runWithTenantAsync } from "../tenant-context";
import { readReferenceData } from "../store";
import { requireHyperAdmin } from "./access";
import { listPlatformTenants } from "./store";
import { resolveGrants } from "./permissions";
import { SCREEN_REGISTRY, canAccessScreen } from "./permission-matrix";
import { PLAN_CATALOG } from "./entitlements";
import { FEATURE_CATALOG } from "./features";
import { SETTING_CATALOG } from "./catalog";
import { listPlatformUsers } from "./user-lifecycle";

/**
 * NeviiOS global arama — tam metin indeksi/uzak servis YOK; mevcut veri
 * üzerinde güvenli V1 eşleşmesi. Yalnız HYPER_ADMIN (platform API + servis
 * kapısı); kurum kullanıcıları 403 alır, başka tenant verisi dönmez.
 * Kullanıcı sonuçlarında e-posta maskelenir; telefon hiç dönmez.
 */
export type SearchResult = { group: string; label: string; detail?: string; href: string };

const norm = (s: string) => s.toLocaleLowerCase("tr");

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(6, local.length - 2)))}@${domain}`;
}

export async function platformSearch(ctx: ServiceContext, rawQuery: string) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const q = norm(rawQuery.trim()).slice(0, 60);
  if (q.length < 2) return fail("VALIDATION_ERROR", "En az 2 karakter girin.");
  const hit = (...fields: (string | undefined | null)[]) => fields.some((f) => f && norm(f).includes(q));
  const results: SearchResult[] = [];
  const push = (group: string, items: SearchResult[]) => results.push(...items.slice(0, 6).map((i) => ({ ...i, group })));

  const grants = await resolveGrants(ctx);
  push(
    "Sayfalar",
    SCREEN_REGISTRY.filter((s) => s.area === "platform" && canAccessScreen({ grants }, s) && hit(s.label, ...(s.keywords ?? []))).map((s) => ({
      group: "",
      label: s.label,
      href: s.path,
    }))
  );

  const tenants = await listPlatformTenants();
  push(
    "Kurumlar",
    tenants.filter((t) => hit(t.name, t.slug, t.tenantId, t.shortName)).map((t) => ({ group: "", label: t.name, detail: t.slug, href: `/platform/kurumlar/${t.tenantId}` }))
  );

  const branchHits: SearchResult[] = [];
  for (const t of tenants) {
    try {
      const data = await runWithTenantAsync(t.tenantId, () => readReferenceData());
      for (const b of data.settings.branches) {
        if (hit(b.name, b.shortName)) branchHits.push({ group: "", label: b.name, detail: t.name, href: `/platform/kurumlar/${t.tenantId}` });
      }
    } catch {
      // Bu depoda operasyon verisi olmayan kurum (json modunda yalnız demo kurumu).
    }
  }
  push("Şubeler", branchHits);

  if (q.length >= 3) {
    const users = await listPlatformUsers(ctx, { status: "all", invite: "none" });
    if (users.ok) {
      push(
        "Kullanıcılar",
        users.data.users
          .filter((u) => hit(u.displayName, u.email.split("@")[0]))
          .map((u) => ({
            group: "",
            label: u.displayName || maskEmail(u.email),
            detail: u.displayName ? `${maskEmail(u.email)} · ${u.tenantName}` : u.tenantName,
            href: `/platform/kullanicilar?q=${encodeURIComponent(rawQuery.trim())}&tenantId=${encodeURIComponent(u.tenantId)}&status=all`,
          }))
      );
    }
  }

  push(
    "Paketler",
    Object.entries(PLAN_CATALOG)
      .filter(([k, p]) => !p.legacy && hit(k, p.label))
      .map(([k, p]) => ({ group: "", label: p.label, detail: "paket", href: `/platform/kurumlar?plan=${k}` }))
  );
  push(
    "Modüller",
    FEATURE_CATALOG.filter((f) => hit(f.label, f.key, f.description)).map((f) => ({
      group: "",
      label: f.label,
      detail: "kurum → Modüller sekmesi",
      href: `/platform/kurumlar`,
    }))
  );
  push(
    "Ayarlar",
    SETTING_CATALOG.filter((s) => hit(s.key, s.description)).map((s) => ({ group: "", label: s.description, detail: s.key, href: `/platform/ayarlar` }))
  );
  if (hit("destek erişimi", "support access", "impersonation")) {
    push("Hızlı erişim", [{ group: "", label: "Destek erişimi (kurum seçin)", href: "/platform/kurumlar" }]);
  }
  return ok({ results });
}
