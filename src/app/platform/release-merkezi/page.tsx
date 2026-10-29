import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getReleaseCenter } from "@/lib/platform/releases";
import { RELEASE_ENVIRONMENTS, RELEASE_PRODUCTS } from "@/lib/platform/types";

export const dynamic = "force-dynamic";

const PRODUCT = { neviihub: "NeviiHub", neviios: "NeviiOS" } as const;
const SOURCE = { manual: "manuel giriş", signed_ci_event: "imzalı CI olayı", provider: "sağlayıcı" } as const;

export default async function ReleaseCenterPage() {
  const session = await requireHyperAdminPage("/platform/release-merkezi");
  const res = await getReleaseCenter(session);
  if (!res.ok) return <EmptyState title="Release merkezi yüklenemedi" description={res.error.message} />;
  const d = res.data;
  const pending = d.migrations.rows.filter((m) => m.applied === false);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Release & operasyon merkezi"
        description="Kod değişikliği, sürüm ve yayın ayrı kavramlardır. Canlı GitHub/Vercel verisi bu sürümde bağlı değil — gösterilen her kayıt kaynağıyla etiketlidir."
        actions={
          <span className="flex gap-2 text-sm">
            <Link className="underline" href="/platform/surumler">Sürümler</Link>
            <Link className="underline" href="/platform/deploymentlar">Deploymentlar</Link>
          </span>
        }
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <h2 className="text-sm font-semibold">Bu sunucuda çalışan sürüm</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div>Sağlayıcı: {d.runtime.provider === "vercel" ? "Vercel" : "bilinmiyor"}</div>
            <div>Ortam: {d.runtime.environment}</div>
            <div>Commit: {d.runtime.commitSha ? <code>{d.runtime.commitSha.slice(0, 12)}</code> : "bilinmiyor"}</div>
            <div>Branch: {d.runtime.branch ?? "bilinmiyor"}</div>
          </dl>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">{d.runtime.note}</p>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold">Deployment sağlayıcısı</h2>
          <p className="mt-2 text-sm">Vercel: {d.provider.configured ? "bağlı" : "bağlı değil"}</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{d.provider.note}</p>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold">İmzalı CI olay alımı</h2>
          <p className="mt-2 text-sm">{d.eventIngest.enabled ? "Açık (RELEASE_EVENT_SECRET tanımlı)" : "Kapalı (secret tanımlı değil → 503)"}</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            POST /api/v1/platform/releases/events · başlık <code>{d.eventIngest.header}</code>: t=&lt;unix&gt;,v1=&lt;hmac-sha256&gt;
          </p>
        </Card>
      </div>
      <Card className="overflow-x-auto">
        <h2 className="text-sm font-semibold">Ortam başına son release</h2>
        <table className="mt-2 w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-xs text-[var(--color-text-muted)]">
              <th className="py-1">Ürün</th>
              {RELEASE_ENVIRONMENTS.map((e) => (
                <th key={e}>{e}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RELEASE_PRODUCTS.map((p) => (
              <tr key={p} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                <td className="py-1 font-medium">{PRODUCT[p]}</td>
                {RELEASE_ENVIRONMENTS.map((e) => {
                  const r = d.latest[`${p}:${e}`];
                  return (
                    <td key={e}>
                      {r ? (
                        <>
                          {r.version} <code className="text-xs">{r.commit.sha.slice(0, 7)}</code>
                          <span className="block text-[11px] text-[var(--color-text-muted)]">{SOURCE[r.source]}</span>
                        </>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">kayıt yok</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="overflow-x-auto">
        <h2 className="text-sm font-semibold">Migration durumu</h2>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {d.migrations.note} {d.migrations.source === "db" ? `Bekleyen: ${pending.length}.` : ""} Bu ekran migration UYGULAMAZ.
        </p>
        <table className="mt-2 w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="text-xs text-[var(--color-text-muted)]">
              <th className="py-1">Migration</th>
              <th>Repo</th>
              <th>Uygulandı</th>
            </tr>
          </thead>
          <tbody>
            {d.migrations.rows.slice(-12).reverse().map((m) => (
              <tr key={m.name} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                <td className="py-1"><code className="text-xs">{m.name}</code></td>
                <td>{m.inRepo ? "var" : "yok"}</td>
                <td>{m.applied === null ? "bilinmiyor" : m.applied ? `evet${m.appliedAt ? ` (${new Date(m.appliedAt).toLocaleDateString("tr-TR")})` : ""}` : "HAYIR — bekliyor"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
