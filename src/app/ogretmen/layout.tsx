import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PortalShell } from "@/components/portal-shell";
import { requireSessionContext } from "@/lib/auth/session";
import { getUserById } from "@/lib/auth/users";
import { DENSITY_COOKIE, PORTAL_PRESENTATION_COOKIE, normalizeDensity, normalizePortalPresentation } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function OgretmenLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen");
  }
  if (session.role === "STUDENT") redirect("/ogrenci");

  const [user, jar] = await Promise.all([getUserById(session.userId), cookies()]);
  const density = normalizeDensity(jar.get(DENSITY_COOKIE)?.value);
  const presentation = normalizePortalPresentation(jar.get(PORTAL_PRESENTATION_COOKIE)?.value);

  return (
    <PortalShell
      role={session.role}
      email={user?.email ?? null}
      portalLabel="Öğretmen Portalı"
      portalKind="teacher"
      density={density}
      presentation={presentation}
    >
      {children}
    </PortalShell>
  );
}
