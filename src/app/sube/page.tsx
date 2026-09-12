import { redirect } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireSessionContext } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { getBranchManagerOverview } from "@/lib/platform/branch-scope";
import { resolveGrants } from "@/lib/platform/permissions";
import { canAccessScreen, SCREEN_REGISTRY } from "@/lib/platform/permission-matrix";
import { resolveAllFeatures } from "@/lib/platform/resolve";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { LogoutButton } from "@/components/logout-button";
import { BranchWorkspace } from "@/components/platform/branch-workspace";

export const dynamic = "force-dynamic";

/**
 * Şube müdürü portalı — tek veri kaynağı `getBranchManagerOverview`
 * (UserBranchAccess ile süzülmüş, finanssız). Atama yoksa fail-closed mesaj.
 * Bölüm görünürlüğü ekran registry + feature flag ile (sunucu da aynı kuralı uygular).
 */
export default async function BranchManagerPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/sube");
  }
  if (session.role !== "BRANCH_MANAGER") redirect(homePathForRole(session.role));

  const [result, grants, features] = await Promise.all([
    runWithTenantAsync(session.tenantId, () => getBranchManagerOverview(session)),
    resolveGrants(session),
    resolveAllFeatures(session.tenantId),
  ]);
  const enabled = new Set(features.filter((f) => f.enabled).map((f) => f.key));
  const announceScreen = SCREEN_REGISTRY.find((s) => s.id === "sube.announcements")!;
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <PageHeader title="Şube paneli" description="Yalnız size atanmış şubelerin verileri. Kurum geneli finans, personel ve ayarlar bu panelde yoktur." />
        <LogoutButton />
      </div>
      {!result.ok ? (
        <EmptyState title="Erişim yok" description={result.error.message} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <h2 className="text-sm font-semibold">Şubeler</h2>
              <ul className="mt-2 text-sm">{result.data.branches.map((b) => <li key={b.id}>{b.name}</li>)}</ul>
            </Card>
            <Card>
              <h2 className="text-sm font-semibold">Öğretmenler ({result.data.teachers.length})</h2>
              <ul className="mt-2 max-h-32 overflow-auto text-sm">{result.data.teachers.map((t) => <li key={t.id}>{t.name}</li>)}</ul>
            </Card>
            <Card>
              <h2 className="text-sm font-semibold">Açık telafi talepleri ({result.data.openMakeups.length})</h2>
              <ul className="mt-2 max-h-32 overflow-auto text-sm">
                {result.data.openMakeups.map((m) => (
                  <li key={m.id}>{m.studentName} <span className="text-xs text-[var(--color-text-muted)]">· {m.status}</span></li>
                ))}
              </ul>
            </Card>
          </div>
          <BranchWorkspace
            lessons={result.data.upcomingLessons}
            students={result.data.students}
            branches={result.data.branches}
            canAnnounce={canAccessScreen({ grants, enabledFeatures: enabled }, announceScreen)}
          />
        </div>
      )}
    </div>
  );
}
