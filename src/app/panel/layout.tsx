import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { PanelHeader } from "@/components/panel-header";
import { requireSessionContext } from "@/lib/auth/session";
import { getUserById } from "@/lib/auth/users";
import { getInstitutionContext } from "@/lib/institution/context";
import { canSeeAllKurumlar, canViewFinanceAndStaffSummary } from "@/lib/auth/platform-access";
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

  // School staff only for admin panel
  if (session.role === "TEACHER") redirect("/ogretmen");
  if (session.role === "STUDENT") redirect("/ogrenci");

  const [kurum, user, jar] = await Promise.all([
    getInstitutionContext(session),
    getUserById(session.userId),
    cookies(),
  ]);
  const currentKurum = kurum.available.find((k) => k.tenantId === session.tenantId);
  const density = normalizeDensity(jar.get(DENSITY_COOKIE)?.value);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        role={session.role}
        kurumlar={kurum.available}
        kurumSelection={kurum.selection}
        canSeeAllKurumlar={canSeeAllKurumlar(session)}
        canViewFinanceAndStaffSummary={canViewFinanceAndStaffSummary(session)}
      />
      <main className="flex-1 overflow-auto">
        <PanelHeader
          role={session.role}
          email={user?.email ?? null}
          kurumName={currentKurum?.name ?? null}
          kurumAvailable={kurum.available}
          kurumSelection={kurum.selection}
          canSeeAllKurumlar={canSeeAllKurumlar(session)}
          density={density}
        />
        <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
