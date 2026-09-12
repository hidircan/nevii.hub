import { PageHeader, Card, EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getPlatformHealth } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export default async function PlatformHealthPage() {
  const session = await requireHyperAdminPage("/platform/sistem-sagligi");
  const result = await getPlatformHealth(session);
  if (!result.ok) {
    return <EmptyState title="Sağlık yüklenemedi" description={result.error.message} />;
  }
  return (
    <div>
      <PageHeader title="Sistem sağlığı" description="NeviiHub altyapı kartları. Gizli anahtar değerleri gösterilmez." />
      <div className="grid gap-3 sm:grid-cols-2">
        {result.data.cards.map((c) => (
          <Card key={c.id}>
            <p className="text-sm font-semibold text-[var(--color-text)]">{c.label}</p>
            <p className="mt-1 text-xs uppercase text-[var(--color-text-muted)]">{c.status}</p>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">{c.detail}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
