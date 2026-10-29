import Link from "@/components/link";
import { PageHeader, Card, EmptyState, Badge } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { listInstitutions } from "@/lib/platform/service";
import { LIFECYCLE_LABELS } from "@/lib/platform/lifecycle";
import { planLabel } from "@/lib/platform/entitlements";
import { getPlanNameMap } from "@/lib/platform/commercial-catalog";

export const dynamic = "force-dynamic";

export default async function PlatformKurumlarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plan?: string; lifecycle?: string }>;
}) {
  const session = await requireHyperAdminPage("/platform/kurumlar");
  const { q, plan, lifecycle } = await searchParams;
  const result = await listInstitutions(session, q, lifecycle);
  if (!result.ok) {
    return <EmptyState title="Kurumlar yüklenemedi" description={result.error.message} />;
  }
  const planNames = await getPlanNameMap();
  const nameOf = (key: string) => planNames.get(key) ?? planLabel(key);

  return (
    <div>
      <PageHeader
        title="Kurum portföyü"
        description="Tüm kurumlar. İşlemler her zaman seçili kurum üzerinde yapılır."
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <form method="get" className="flex flex-1 flex-wrap gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Kurum adı ile ara"
            aria-label="Kurum ara"
            className="w-full max-w-md rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          />
          <select
            name="lifecycle"
            defaultValue={lifecycle ?? ""}
            aria-label="Duruma göre süz"
            className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          >
            <option value="">Tüm durumlar</option>
            {Object.entries(LIFECYCLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {plan ? <input type="hidden" name="plan" value={plan} /> : null}
          <button type="submit" className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white">
            Ara
          </button>
        </form>
        <Link
          href="/platform/kurumlar/yeni"
          className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white"
        >
          + Yeni kurum oluştur
        </Link>
      </div>
      {plan ? <p className="mb-3 text-sm text-[var(--color-text-muted)]">Paket filtresi: {nameOf(plan)}</p> : null}
      {result.data.tenants.length === 0 ? (
        <EmptyState title="Kurum bulunamadı" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-[var(--color-text-muted)]" style={{ borderColor: "var(--color-border)" }}>
                <th className="px-4 py-2">Kurum</th>
                <th className="px-4 py-2">Durum</th>
                <th className="px-4 py-2">Paket</th>
                <th className="px-4 py-2">Yetkili</th>
                <th className="px-4 py-2">Telefon</th>
                <th className="px-4 py-2">Oluşturma</th>
              </tr>
            </thead>
            <tbody>
              {result.data.tenants.filter((t) => !plan || t.planKey === plan).map((t) => (
                <tr key={t.tenantId} className="border-b" style={{ borderColor: "var(--color-border)" }}>
                  <td className="px-4 py-2">
                    <Link href={`/platform/kurumlar/${t.tenantId}`} className="font-semibold text-[var(--color-primary)] hover:underline">
                      {t.name}
                    </Link>
                    <p className="text-xs text-[var(--color-text-muted)]" title="Kısa adres bağlantılarda kullanılır; Türkçe karaktersiz yazılır">
                      kısa adres: {t.slug}
                    </p>
                  </td>
                  <td className="px-4 py-2">
                    <Badge>{LIFECYCLE_LABELS[t.lifecycle]}</Badge>
                    {t.provisionError ? <p className="mt-1 text-xs text-[var(--color-danger)]">Kurulum hatası</p> : null}
                  </td>
                  <td className="px-4 py-2">{nameOf(t.planKey)}</td>
                  <td className="px-4 py-2 text-xs">
                    {t.ownerEmail ? (
                      <a className="text-[var(--color-primary)] hover:underline" href={`mailto:${t.ownerEmail}`}>
                        {t.ownerEmail}
                      </a>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">Belirtilmemiş</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {t.schoolPhone ? (
                      <a className="text-[var(--color-primary)] hover:underline" href={`tel:${t.schoolPhone.replace(/\s+/g, "")}`}>
                        {t.schoolPhone}
                      </a>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">Belirtilmemiş</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-[var(--color-text-muted)]">{new Date(t.createdAt).toLocaleDateString("tr-TR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
