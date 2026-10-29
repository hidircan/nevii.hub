import { cookies, headers } from "next/headers";
import { PlatformMobileNav, PlatformNav } from "@/components/platform/platform-nav";
import { PlatformForbidden } from "@/components/platform/platform-forbidden";
import { PlatformCommandPalette } from "@/components/platform/platform-command-palette";
import { PlatformUserMenu } from "@/components/platform/platform-user-menu";
import { requirePlatformSession, isPlatformForbidden } from "@/lib/platform/session";
import { getUserById } from "@/lib/auth/users";
import { roleLabelTr } from "@/lib/auth/role-labels";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { resolveGrants } from "@/lib/platform/permissions";
import { screensFor } from "@/lib/platform/permission-matrix";
import { getUserLifecycle } from "@/lib/platform/store-ext";
import { getSessionAppearancePolicy } from "@/lib/platform/access";
import { FONT_COOKIE, THEME_PROFILE_COOKIE, normalizeFontChoice, normalizeThemeProfile } from "@/lib/theme";
import { resolvePlatformShell } from "@/lib/platform/shell-theme";
import { getUserPreferences } from "@/lib/user-preferences";
import "./neviios-theme.css";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  // Control Center (2026-09-28) — oturumsuz platform kapısı (`/platform/giris`)
  // bu kabuğun oturum duvarına takılmaz: yolu middleware'in ilettiği başlıktan
  // okur, kapıysa çocukları çıplak render eder (kabuğun geri kalanı çalışmaz).
  // Başlık middleware tarafından GERÇEK yolla ezilir; en kötü olasılık herkese
  // açık giriş formunun kabuksuz görünmesidir.
  const gatePath = (await headers()).get("x-neviios-path");
  if (gatePath === "/platform/giris") {
    return <div className="min-h-screen">{children}</div>;
  }
  const session = await requirePlatformSession("/platform");
  if (isPlatformForbidden(session)) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] px-6">
        <PlatformForbidden role={session.role} />
      </div>
    );
  }

  const [user, lifecycle, grants, policy, jar, prefs] = await Promise.all([
    getUserById(session.userId),
    getUserLifecycle(session.userId).catch(() => null),
    resolveGrants(session),
    getSessionAppearancePolicy(),
    cookies(),
    getUserPreferences(session.userId, session.tenantId).catch(() => null),
  ]);
  // Control Center (2026-09-28) — kayıtlı tercihi OLMAYAN HYPER_ADMIN için
  // "Homebrew Hacker" varsayılan seçilidir. Kayıtlı tercih (store) veya
  // cookie EZİLMEZ: ikisinden biri varsa aynen saygı duyulur. Kurum paneli
  // bu sarmalayıcının dışındadır — varsayılanı değişmez.
  const cookieTheme = jar.get(THEME_PROFILE_COOKIE)?.value;
  const shell = resolvePlatformShell({ role: session.role, savedThemeProfile: prefs?.themeProfile, cookieTheme });
  const homebrewDefault = shell === "homebrew";
  // Menü = ekran registry + aynı resolver (sunucu kontrolüyle tek kaynak).
  const links = screensFor({ grants }, "platform").map((s) => ({ href: s.path, label: s.label, group: s.navGroup ?? null }));
  return (
    <div
      className={
        shell === "homebrew"
          ? "theme-homebrew flex min-h-screen"
          : shell === "console"
            ? "neviios-console flex min-h-screen"
            : "flex min-h-screen bg-[var(--color-bg)]"
      }
    >
      <PlatformNav links={links} />
      <main className="min-w-0 flex-1 overflow-auto">
        <header
          className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b px-6 py-2.5 backdrop-blur lg:px-10"
          style={{
            borderColor: "var(--color-border)",
            background: "color-mix(in srgb, var(--color-surface) 92%, transparent)",
          }}
        >
          <p className="truncate text-sm font-semibold text-[var(--color-text)]">
            {PLATFORM_BRAND.name} · {PLATFORM_BRAND.productLine}
          </p>
          <div className="flex items-center gap-3">
            <PlatformCommandPalette />
            <PlatformUserMenu
              email={user?.email ?? null}
              displayName={lifecycle?.displayName ?? null}
              roleLabel={roleLabelTr(session.role)}
              profile={homebrewDefault ? "homebrew" : normalizeThemeProfile(cookieTheme)}
              font={normalizeFontChoice(jar.get(FONT_COOKIE)?.value)}
              policy={policy}
            />
          </div>
        </header>
        <PlatformMobileNav links={links} />
        <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
