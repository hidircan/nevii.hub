import { PageHeader, EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getPlatformAuditLog } from "@/lib/platform/service";
import { AuditTimeline } from "@/components/platform/audit-timeline";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm";

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string; action?: string; actor?: string }>;
}) {
  const session = await requireHyperAdminPage("/platform/denetim");
  const { tenantId, action, actor } = await searchParams;
  const result = await getPlatformAuditLog(session, tenantId || undefined, {
    action: action || undefined,
    actorUserId: actor || undefined,
  });
  if (!result.ok) {
    return <EmptyState title="Denetim kaydı yüklenemedi" description={result.error.message} />;
  }
  return (
    <div>
      <PageHeader
        title="Denetim zaman çizelgesi"
        description="Paket, rol, şube erişimi, tema, logo, form, politika ve destek erişimi olayları. Secret değerleri redakte edilir."
      />
      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <input name="tenantId" defaultValue={tenantId ?? ""} placeholder="Hedef tenantId" aria-label="Hedef tenant" className={inputCls} />
        <input name="action" defaultValue={action ?? ""} placeholder="İşlem öneki (örn. platform.user)" aria-label="İşlem" className={inputCls} />
        <input name="actor" defaultValue={actor ?? ""} placeholder="Aktör userId" aria-label="Aktör" className={inputCls} />
        <button type="submit" className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white">
          Filtrele
        </button>
      </form>
      <AuditTimeline events={result.data.events} />
    </div>
  );
}
