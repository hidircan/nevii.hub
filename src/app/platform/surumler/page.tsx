import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getReleaseCenter } from "@/lib/platform/releases";
import { listPlatformTenants } from "@/lib/platform/store";
import { ReleaseForm } from "@/components/platform/release-forms";

export const dynamic = "force-dynamic";

const CHECK = { unknown: "bilinmiyor", pending: "bekliyor", passed: "geçti", failed: "başarısız" } as const;

export default async function ReleasesPage() {
  const session = await requireHyperAdminPage("/platform/surumler");
  const res = await getReleaseCenter(session);
  if (!res.ok) return <EmptyState title="Sürümler yüklenemedi" description={res.error.message} />;
  const tenants = await listPlatformTenants();
  const name = new Map(tenants.map((t) => [t.tenantId, t.name]));
  return (
    <div className="space-y-4">
      <PageHeader title="Sürümler" description="Yayınlanan sürüm kayıtları. Her kod değişikliği sürüm değildir; sürüm açıkça kaydedilir." />
      {res.data.releases.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">Henüz release kaydı yok.</p> : null}
      {res.data.releases.map((r) => (
        <Card key={r.id} className="space-y-1 text-sm">
          <p className="font-semibold">
            {r.name} · {r.version} · {r.product === "neviihub" ? "NeviiHub" : "NeviiOS"} · {r.environment}
            <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">{r.source === "manual" ? "manuel giriş" : "imzalı CI olayı"}</span>
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            <code>{r.commit.sha.slice(0, 12)}</code> · {r.commit.branch}
            {r.commit.prNumber ? ` · PR #${r.commit.prNumber}` : ""} · build {CHECK[r.build]} · test {CHECK[r.tests]} · yayınlayan {r.publishedBy} ·{" "}
            {new Date(r.publishedAt).toLocaleString("tr-TR")}
          </p>
          <p>{r.summary}</p>
          {r.technicalNotes ? <p className="text-xs">Teknik: {r.technicalNotes}</p> : null}
          {r.knownRisks ? <p className="text-xs text-[var(--color-danger)]">Riskler: {r.knownRisks}</p> : null}
          <p className="text-xs text-[var(--color-text-muted)]">
            Kurumlar: {r.affectedTenants === "all" ? "tümü" : r.affectedTenants.map((t) => name.get(t) ?? t).join(", ")} · Modüller: {r.affectedModules.join(", ") || "—"} · Rollback:{" "}
            {r.rollbackTarget ?? "—"} · Migration: {r.migrations.map((m) => `${m.name} (${m.status})`).join(", ") || "yok"}
            {r.deploymentUrl ? <> · <a className="underline" href={r.deploymentUrl} rel="noreferrer" target="_blank">deployment</a></> : null}
          </p>
        </Card>
      ))}
      <ReleaseForm tenants={tenants.map((t) => ({ tenantId: t.tenantId, name: t.name }))} />
    </div>
  );
}
