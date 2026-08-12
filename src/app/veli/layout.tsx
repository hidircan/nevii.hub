import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PortalShell } from "@/components/portal-shell";
import { requireSessionContext } from "@/lib/auth/session";
import { getUserById } from "@/lib/auth/users";
import { DENSITY_COOKIE, normalizeDensity } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function VeliLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/veli");
  }
  if (session.role === "TEACHER") redirect("/ogretmen");
  if (session.role === "STUDENT") redirect("/ogrenci");

  const [user, jar] = await Promise.all([getUserById(session.userId), cookies()]);
  const density = normalizeDensity(jar.get(DENSITY_COOKIE)?.value);

  return (
    <PortalShell role={session.role} email={user?.email ?? null} portalLabel="Veli Portalı" portalKind="parent" density={density}>
      {children}
    </PortalShell>
  );
}
