import { Card } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getMobileControlMatrix, getMobilePolicy } from "@/lib/platform/mobile-policy";
import { MobileControlMatrix } from "@/components/platform/mobile-control-matrix";
import { TenantSettingsSection } from "../settings-section";
import { buildConfigSnapshot } from "@/lib/platform/config-snapshot";
import { listPolicyVersions } from "@/lib/platform/store-ext";
import { resolveSetting } from "@/lib/platform/resolve";
import { getPlatformTenant } from "@/lib/platform/store";
import { MobileEntitlementBanner } from "@/components/platform/mobile-entitlement-banner";

export const dynamic = "force-dynamic";

const ROLES = [
  ["STUDENT", "Öğrenci/veli"],
  ["TEACHER", "Öğretmen"],
  ["SUPER_ADMIN", "Kurum sahibi"],
  ["BRANCH_MANAGER", "Şube müdürü"],
] as const;

export default async function TenantMobilePage({ params }: { params: Promise<{ tenantId: string }> }) {
  await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  const [snapshot, mobileVersions, matrix, entOverrides, tenant] = await Promise.all([
    buildConfigSnapshot(tenantId, null),
    listPolicyVersions(tenantId).then((vs) => vs.filter((x) => x.key.startsWith("mobile.") && x.status !== "draft").slice(0, 8)),
    getMobileControlMatrix(tenantId),
    resolveSetting({ tenantId }, "subscription.entitlementOverrides"),
    getPlatformTenant(tenantId),
  ]);
  const notEntitled = matrix.ok && matrix.data.rows.some((r) => r.key === "app" && !r.entitled);
  const ov = entOverrides?.effectiveValue;
  const currentOverrides = (ov && typeof ov === "object" && !Array.isArray(ov) ? ov : {}) as Record<string, boolean>;
  const previews = await Promise.all(
    ROLES.map(async ([role, label]) => {
      const r = await getMobilePolicy({ role, userId: "preview", tenantId, channel: "mobile" }, { platform: "ios" });
      return { label, decision: r.ok ? r.data : null };
    })
  );
  return (
    <div className="space-y-4">
      {notEntitled ? (
        <MobileEntitlementBanner
          tenantId={tenantId}
          targetLabel={`${tenant?.name ?? tenantId} (${tenantId})`}
          currentOverrides={currentOverrides}
        />
      ) : null}
      {matrix.ok ? <MobileControlMatrix rows={matrix.data.rows} /> : null}
      <Card>
        <h2 className="text-sm font-semibold">Efektif mobil erişim (iOS önizleme)</h2>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          NeviiOS yalnız policy yönetir; store bağlantısı, build ve push gönderimi yoktur. Push sağlayıcısı bağlı olmadığı için
          push hiçbir durumda &ldquo;aktif&rdquo; gösterilmez.
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {previews.map((p) => (
            <li key={p.label}>
              <strong>{p.label}:</strong>{" "}
              {p.decision?.allowed ? (
                <span className="text-[var(--color-success)]">izinli</span>
              ) : (
                <span className="text-[var(--color-danger)]">kapalı — {p.decision?.reasons.join(" ")}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">
          Mobil sözleşme: <code>GET /api/v1/mobile/policy?platform=ios&amp;appVersion=1.2.0</code> (contractVersion 1).
        </p>
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">NeviiHub senkron durumu</h2>
        <p className="mt-1 text-sm">
          Config sürümü <strong>{snapshot.configVersion}</strong> · ETag <code className="text-xs">{snapshot.etag.slice(0, 12)}…</code>
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          NeviiHub <code>GET /api/v1/config/snapshot</code> ile okur (If-None-Match → 304). Kritik mobil ayarlar taslak → önizleme → yayın → audit → geri al
          zincirinden geçer (<a className="underline" href={`/platform/kurumlar/${tenantId}/surumler`}>Sürümler</a>); geri alma eski kaydı silmez.
        </p>
        <ul className="mt-2 space-y-0.5 text-xs">
          {mobileVersions.length === 0 ? <li className="text-[var(--color-text-muted)]">Bu kurumda mobil politika yayını yok (platform varsayılanı).</li> : null}
          {mobileVersions.map((v) => (
            <li key={v.id}>
              <code>{v.key}</code> v{v.version} · {v.status === "published" ? "yayında" : "önceki"} · {v.reason}
              {v.rollbackOfVersion ? ` · v${v.rollbackOfVersion}'e dönüş` : ""}
            </li>
          ))}
        </ul>
      </Card>
      <TenantSettingsSection tenantId={tenantId} categories={["mobile"]} />
    </div>
  );
}
