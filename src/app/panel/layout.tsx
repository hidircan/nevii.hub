import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { LastRouteTracker } from "@/components/last-route-tracker";
import { PanelHeader } from "@/components/panel-header";
import { PanelNavProvider } from "@/components/panel-nav-context";
import { requireSessionContext } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { getUserById } from "@/lib/auth/users";
import { getInstitutionContext } from "@/lib/institution/context";
import { canSeeAllKurumlar, canViewFinanceAndStaffSummary } from "@/lib/auth/platform-access";
import { canAccessTeacherEarnings } from "@/lib/platform/teacher-earnings-access";
import { DENSITY_COOKIE, normalizeDensity } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel");
  }

  // School staff only for admin panel — platform sahibi kurum paneline düşmez
  // Fail-closed allowlist: panel sayfaları kurum geneli veri okur; yalnız
  // kurum geneli roller girer (HYPER_ADMIN → /platform). BRANCH_MANAGER,
  // kurum preset'i "unified" ise efektif SCHOOL_ADMIN olarak girer; aksi
  // halde /sube'ye yönlenir (bkz. platform/manager-preset.ts).
  if (session.role !== "SUPER_ADMIN" && session.role !== "SCHOOL_ADMIN" && session.role !== "AI_AGENT") {
    redirect(homePathForRole(session.role));
  }

  const [kurum, user, jar] = await Promise.all([
    getInstitutionContext(session),
    getUserById(session.userId),
    cookies(),
  ]);
  const currentKurum = kurum.available.find((k) => k.tenantId === session.tenantId);
  const density = normalizeDensity(jar.get(DENSITY_COOKIE)?.value);
  // P1 (2026-09-11) — hesap workspace'i: sidebar sırası + dar/geniş tercihi
  // server kaydından gelir (cookie yalnız önbellek). Kayıt yoksa varsayılan.
  let initialNavOrder: Record<string, string[]> | undefined;
  let initialCollapsed = jar.get("notaplan_sidebar_collapsed")?.value === "1";
  try {
    const { getUserPreferences } = await import("@/lib/user-preferences");
    const prefs = await getUserPreferences(session.userId, session.tenantId);
    if (prefs.navOrder) initialNavOrder = prefs.navOrder;
    if (typeof prefs.sidebarCollapsed === "boolean") initialCollapsed = prefs.sidebarCollapsed;
  } catch {
    // best-effort — varsayılan düzenle devam.
  }

  return (
    <div className="flex min-h-screen">
      <PanelNavProvider>
        <LastRouteTracker />
        <Sidebar
          key={session.userId}
          role={session.role}
          kurumlar={kurum.available}
          kurumSelection={kurum.selection}
          canSeeAllKurumlar={canSeeAllKurumlar(session)}
          canViewFinanceAndStaffSummary={canViewFinanceAndStaffSummary(session)}
          canViewTeacherEarnings={await canAccessTeacherEarnings(session)}
          userKey={session.userId}
          initialNavOrder={initialNavOrder}
          initialCollapsed={initialCollapsed}
        />
        {/*
         * `min-w-0`: flex çocuğu geniş tablolarda daralamazsa sayfa yatay
         * taşar — `flex-1` tek başına yetmez (min-width:auto). `id`,
         * drawer açıkken iç kaydırıcının kilitlenmesi içindir.
         */}
        <main id="panel-main" className="min-w-0 flex-1 overflow-auto">
          <PanelHeader
            role={session.role}
            email={user?.email ?? null}
            kurumName={currentKurum?.name ?? null}
            kurumAvailable={kurum.available}
            kurumSelection={kurum.selection}
            canSeeAllKurumlar={canSeeAllKurumlar(session)}
            density={density}
            loginRole={session.loginRole}
          />
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">{children}</div>
        </main>
      </PanelNavProvider>
    </div>
  );
}
