import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getReleaseCenter } from "@/lib/platform/releases";
import { DeploymentForm } from "@/components/platform/release-forms";

export const dynamic = "force-dynamic";

export default async function DeploymentsPage() {
  const session = await requireHyperAdminPage("/platform/deploymentlar");
  const res = await getReleaseCenter(session);
  if (!res.ok) return <EmptyState title="Deploymentlar yüklenemedi" description={res.error.message} />;
  const d = res.data;
  return (
    <div className="space-y-4">
      <PageHeader title="Deploymentlar" description={d.provider.note} />
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]" style={{ borderColor: "var(--color-border)" }}>
              <th className="px-4 py-2">Tarih</th>
              <th>Ürün</th>
              <th>Ortam</th>
              <th>Commit / branch</th>
              <th>Durum</th>
              <th>Release</th>
              <th>Kaynak</th>
            </tr>
          </thead>
          <tbody>
            {d.deployments.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-3 text-[var(--color-text-muted)]">
                  Kayıt yok. Sağlayıcı bağlı olmadığı için liste otomatik dolmaz.
                </td>
              </tr>
            ) : null}
            {d.deployments.map((x) => (
              <tr key={x.id} className="border-b" style={{ borderColor: "var(--color-border)" }}>
                <td className="px-4 py-2">{new Date(x.createdAt).toLocaleString("tr-TR")}</td>
                <td>{x.product}</td>
                <td>{x.environment}</td>
                <td>
                  <code className="text-xs">{x.commitSha.slice(0, 10)}</code> · {x.branch}
                  {x.url ? <> · <a className="underline" href={x.url} target="_blank" rel="noreferrer">aç</a></> : null}
                </td>
                <td>{x.status}</td>
                <td>{d.releases.find((r) => r.id === x.releaseId)?.version ?? "—"}</td>
                <td className="text-xs">{x.source === "manual" ? `manuel (${x.provider})` : x.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <DeploymentForm releases={d.releases.map((r) => ({ id: r.id, label: `${r.product} ${r.version} (${r.environment})` }))} />
    </div>
  );
}
