import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PortalShell } from "@/components/portal-shell";
import { requireSessionContext } from "@/lib/auth/session";
import { getUserById } from "@/lib/auth/users";
import { getActiveAccessType } from "@/lib/student-portal-access";
import { getCurrentConsentTextVersionTool, getConsentStatusTool } from "@/lib/services";
import { KvkkConsentGate } from "@/components/kvkk-consent-gate";
import { DENSITY_COOKIE, PORTAL_PRESENTATION_COOKIE, normalizeDensity, normalizePortalPresentation } from "@/lib/theme";

export const dynamic = "force-dynamic";

const FIRST_LOGIN_CONSENT_TYPE = "kvkk_general";

export default async function OgrenciLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogrenci");
  }
  if (session.role === "TEACHER") redirect("/ogretmen");

  const [user, jar] = await Promise.all([getUserById(session.userId), cookies()]);
  const density = normalizeDensity(jar.get(DENSITY_COOKIE)?.value);
  const presentation = normalizePortalPresentation(jar.get(PORTAL_PRESENTATION_COOKIE)?.value);

  // Faz 8 (KVKK) — first-login gate: yalnızca tenant için yürürlükte bir
  // "kvkk_general" metni TANIMLIYSA uygulanır (mevcut kurumların/demo
  // tenant'ların girişi bu özellik eklendiği için SESSİZCE KİLİTLENMEZ).
  // Route guard'ı (middleware) bozmadan — kimliği zaten doğrulanmış bir
  // kullanıcı için layout seviyesinde içerik yerine onay ekranı gösterir.
  if (session.role === "STUDENT" && session.studentId) {
    const textResult = await getCurrentConsentTextVersionTool(session, { consentType: FIRST_LOGIN_CONSENT_TYPE });
    const currentVersion = textResult.ok ? textResult.data.version : undefined;
    if (currentVersion) {
      const accessType = await getActiveAccessType(session.tenantId, session.userId, session.studentId);
      const subjectType = accessType === "GUARDIAN" ? "parent" : "student";
      const statusResult = await getConsentStatusTool(session, {
        subjectType,
        subjectId: session.studentId,
        consentType: FIRST_LOGIN_CONSENT_TYPE,
      });
      const status = statusResult.ok ? statusResult.data.status : "missing";
      if (status !== "valid") {
        return (
          <KvkkConsentGate
            subjectType={subjectType}
            subjectId={session.studentId}
            consentType={FIRST_LOGIN_CONSENT_TYPE}
            bodyText={currentVersion.bodyText}
            version={currentVersion.version}
            status={status}
          />
        );
      }
    }
  }

  return (
    <PortalShell
      role={session.role}
      email={user?.email ?? null}
      portalLabel="Öğrenci Portalı"
      portalKind="student"
      density={density}
      presentation={presentation}
    >
      {children}
    </PortalShell>
  );
}
