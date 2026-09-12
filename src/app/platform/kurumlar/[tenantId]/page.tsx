import Link from "next/link";
import { Card, EmptyState, Badge } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getInstitutionOverview, getProvisionHistory, getTenantSettings } from "@/lib/platform/service";
import { LIFECYCLE_LABELS } from "@/lib/platform/lifecycle";
import { planLabel } from "@/lib/platform/entitlements";
import { roleLabelTr } from "@/lib/auth/role-labels";
import type { AppRole } from "@/lib/auth/types";
import { LifecycleControl, ProvisionPanel } from "@/components/platform/tenant-admin-controls";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  music: "Müzik okulu",
  art: "Sanat merkezi",
  sports: "Spor okulu",
  dance: "Dans okulu",
  yoga_pilates: "Yoga / Pilates",
  course: "Kurs merkezi",
  other: "Diğer",
};

export default async function TenantOverviewPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  const [result, history, settings] = await Promise.all([
    getInstitutionOverview(session, tenantId),
    getProvisionHistory(session, tenantId),
    getTenantSettings(session, tenantId),
  ]);
  if (!result.ok) {
    return <EmptyState title="Kurum yüklenemedi" description={result.error.message} />;
  }
  const { tenant, features, branches, users, audit } = result.data;
  const base = `/platform/kurumlar/${tenantId}`;
  const type = settings.ok ? String(settings.data.settings.find((s) => s.key === "institution.type")?.effectiveValue ?? "") : "";
  const managers = users.filter((u) => u.role === "SUPER_ADMIN" || u.role === "SCHOOL_ADMIN" || u.role === "BRANCH_MANAGER");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="text-sm font-semibold">Kurum profili</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-[var(--color-text-muted)]">Durum</dt>
          <dd><Badge>{LIFECYCLE_LABELS[tenant.lifecycle]}</Badge></dd>
          <dt className="text-[var(--color-text-muted)]">Tür</dt>
          <dd>{TYPE_LABEL[type] ?? "henüz yapılandırılmadı"}</dd>
          <dt className="text-[var(--color-text-muted)]">Paket</dt>
          <dd>{planLabel(tenant.planKey)}</dd>
          <dt className="text-[var(--color-text-muted)]">İletişim</dt>
          <dd>{tenant.contactEmail || "henüz yapılandırılmadı"}</dd>
          <dt className="text-[var(--color-text-muted)]">Bölge</dt>
          <dd>{tenant.country} · {tenant.timezone} · {tenant.currency}</dd>
        </dl>
        {tenant.provisionError ? (
          <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">Kurulum hatası: {tenant.provisionError}</p>
        ) : null}
        <div className="mt-3 space-y-2">
          <ProvisionPanel tenantId={tenantId} lifecycle={tenant.lifecycle} />
          <LifecycleControl tenantId={tenantId} lifecycle={tenant.lifecycle} />
        </div>
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">Yöneticiler ve şubeler</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {managers.length === 0 ? <li className="text-[var(--color-text-muted)]">Yönetici henüz yok (davet bekliyor olabilir)</li> : null}
          {managers.map((u) => (
            <li key={u.id}>
              {u.email} <span className="text-xs text-[var(--color-text-muted)]">· {roleLabelTr(u.role as AppRole)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs font-semibold text-[var(--color-text-muted)]">Şubeler</p>
        <ul className="text-sm text-[var(--color-text-muted)]">
          {branches.length === 0 ? <li>Şube verisi bu depoda yok</li> : branches.map((b) => <li key={b.id}>{b.name}</li>)}
        </ul>
        <Link href={`${base}/kullanicilar`} className="mt-2 inline-block text-sm text-[var(--color-primary)] hover:underline">
          Kullanıcı ve rol yönetimi
        </Link>
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">Modüller</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          {features.filter((f) => f.enabled).length}/{features.length} açık · {features.filter((f) => !f.entitled).length} modül pakette yok
        </p>
        <Link href={`${base}/ozellikler`} className="mt-2 inline-block text-sm text-[var(--color-primary)] hover:underline">
          Modül yönetimi
        </Link>
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">Kurulum ve davetler</h2>
        {history.ok ? (
          <ul className="mt-2 space-y-1 text-xs text-[var(--color-text-muted)]">
            {history.data.runs.slice(0, 3).map((r) => (
              <li key={r.id}>
                Kurulum {new Date(r.createdAt).toLocaleString("tr-TR")} · {r.status}
                {r.error ? ` · ${r.error}` : ""}
              </li>
            ))}
            {history.data.invitations.slice(0, 5).map((i) => (
              <li key={i.id}>
                Davet {i.email} · {roleLabelTr(i.role as AppRole)} · {i.status}
              </li>
            ))}
            {history.data.runs.length === 0 && history.data.invitations.length === 0 ? <li>Kayıt yok</li> : null}
          </ul>
        ) : null}
      </Card>
      <Card className="lg:col-span-2">
        <h2 className="text-sm font-semibold">Son denetim olayları</h2>
        <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-muted)]">
          {audit.length === 0 ? <li>Kayıt yok</li> : audit.slice(0, 8).map((e) => (
            <li key={e.id}>
              {new Date(e.createdAt).toLocaleString("tr-TR")} · {e.action} · {e.actorRole}
            </li>
          ))}
        </ul>
        <Link href={`${base}/denetim`} className="mt-2 inline-block text-sm text-[var(--color-primary)] hover:underline">
          Tüm zaman çizelgesi
        </Link>
      </Card>
    </div>
  );
}
