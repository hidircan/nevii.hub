import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSessionContext, homePathForRole } from "@/lib/auth/session";
import {
  THEME_PROFILE_COOKIE,
  FONT_COOKIE,
  DENSITY_COOKIE,
  normalizeThemeProfile,
  normalizeFontChoice,
  normalizeDensity,
} from "@/lib/theme";
import { ThemePreferencesForm } from "@/components/theme-preferences-form";

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
  const profile = normalizeThemeProfile(jar.get(THEME_PROFILE_COOKIE)?.value);
  const font = normalizeFontChoice(jar.get(FONT_COOKIE)?.value);
  const density = normalizeDensity(jar.get(DENSITY_COOKIE)?.value);
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
        <ThemePreferencesForm initialProfile={profile} initialFont={font} initialDensity={density} />
      </main>
    </div>
  );
}
