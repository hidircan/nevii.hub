import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSessionContext, homePathForRole } from "@/lib/auth/session";
import {
  THEME_PROFILE_COOKIE,
  FONT_COOKIE,
  DENSITY_COOKIE,
  PORTAL_PRESENTATION_COOKIE,
  normalizeThemeProfile,
  normalizeFontChoice,
  normalizeDensity,
  normalizePortalPresentation,
  THEME_PROFILE_VALUES,
} from "@/lib/theme";
import { getSessionAppearancePolicy } from "@/lib/platform/access";
import { applyAppearancePolicy, isProfileAllowed } from "@/lib/platform/policies";
import { ThemePreferencesForm } from "@/components/theme-preferences-form";
import { PortalPresentationForm } from "@/components/portal-presentation-form";

export const dynamic = "force-dynamic";

/**
 * Kişisel görünüm tercihi — kurum genelini değiştirmez, yalnızca bu
 * tarayıcı/kullanıcıya aittir. Kasıtlı olarak /panel dışında: admin,
 * öğretmen, veli VE öğrenci aynı sayfadan kendi tercihini seçebilsin diye
 * (panel/layout.tsx yalnızca SCHOOL_ADMIN/SUPER_ADMIN'e izin verir).
 */
export default async function AppearanceSettingsPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/gorunum-ayarlari");
  }

  const jar = await cookies();
  // Kurum görünüm politikası: efektif değer + seçilebilir profiller (root layout ve server action ile aynı kural).
  const policy = await getSessionAppearancePolicy();
  const { profile, font, fontLocked } = applyAppearancePolicy(policy, {
    profile: normalizeThemeProfile(jar.get(THEME_PROFILE_COOKIE)?.value),
    font: normalizeFontChoice(jar.get(FONT_COOKIE)?.value),
  });
  const allowedProfiles = THEME_PROFILE_VALUES.filter((p) => isProfileAllowed(policy, p));
  const density = normalizeDensity(jar.get(DENSITY_COOKIE)?.value);
  const portalPresentation = normalizePortalPresentation(jar.get(PORTAL_PRESENTATION_COOKIE)?.value);
  const backHref = homePathForRole(session.role);

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Geri
          </Link>
          <h1 className="text-sm font-semibold text-[var(--color-text)]">Görünüm Ayarları</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <p className="text-sm text-[var(--color-text-muted)]">
          Renk teması ve yazı tipini kişisel tercihinize göre seçin — canlı önizleme ile.
        </p>
        {allowedProfiles.length < THEME_PROFILE_VALUES.length || fontLocked ? (
          <p className="text-xs text-[var(--color-text-muted)]">Bazı seçenekler kurumunuzun görünüm politikası nedeniyle kapalı.</p>
        ) : null}
        <ThemePreferencesForm
          initialProfile={profile}
          initialFont={font}
          initialDensity={density}
          allowedProfiles={allowedProfiles}
          fontLocked={fontLocked}
        />
        <PortalPresentationForm initialPresentation={portalPresentation} />
      </main>
    </div>
  );
}
