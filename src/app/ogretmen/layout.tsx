import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PortalShell } from "@/components/portal-shell";
import { requireSessionContext } from "@/lib/auth/session";
import { getUserById } from "@/lib/auth/users";
import { DENSITY_COOKIE, normalizeDensity } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function OgretmenLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen");
  }
  if (session.role === "PARENT") redirect("/veli");
  if (session.role === "STUDENT") redirect("/ogrenci");

  const [user, jar] = await Promise.all([getUserById(session.userId), cookies()]);
  const density = normalizeDensity(jar.get(DENSITY_COOKIE)?.value);

  return (
    <PortalShell role={session.role} email={user?.email ?? null} portalLabel="Öğretmen Portalı" portalKind="teacher" density={density}>
      {children}
    </PortalShell>
  );
}
