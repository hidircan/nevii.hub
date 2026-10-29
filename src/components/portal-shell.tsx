"use client";

/**
 * İş 5A — öğretmen/veli/öğrenci için ortak, role-uyarlanabilir portal
 * kabuğu. Panel'deki desen (PanelHeader: NotificationBell + UserMenu)
 * BİREBİR yeniden kullanılır — ikinci bir avatar/bildirim sistemi icat
 * edilmedi. Masaüstünde üst navigasyon satırı, mobilde (< 768px) sabit alt
 * navigasyon (en fazla 4 hedef + "Diğer") gösterir. `children` şu an hâlâ
 * kendi `max-w-lg` gövdesini taşıyan mevcut sayfa içerikleridir — sayfa
 * gövdelerini masaüstünde genişletmek ayrı, kapsam dışı bırakılan bir
 * takip işidir (bkz. final rapor).
 */
import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/notification-bell";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/auth/types";
import type { Density, PortalPresentation } from "@/lib/theme";
import { TEACHER_PORTAL_NAV, STUDENT_PORTAL_NAV } from "@/lib/nav/portal-nav";

export type PortalKind = "teacher" | "student";

/**
 * Nav dizileri (icon: LucideIcon FONKSİYONLARI içerir) burada, Client
 * Component'in KENDİSİNDE import edilir — Server Component layout'undan
 * prop olarak GEÇİRİLMEZ. React, fonksiyon/component referanslarını
 * server→client sınırı üzerinden serileştiremez ("Only plain objects can
 * be passed to Client Components" hatası); bu yüzden `portal-nav.ts`'i
 * doğrudan import eden panel `Sidebar.tsx` ile AYNI deseni izler.
 */
const PORTAL_NAV: Record<PortalKind, typeof TEACHER_PORTAL_NAV> = {
  teacher: TEACHER_PORTAL_NAV,
  student: STUDENT_PORTAL_NAV,
};

function isActive(pathname: string, href: string): boolean {
  const base = href.split("#")[0] || href;
  if (base === "") return false;
  const isHome = base === "/ogretmen" || base === "/veli" || base === "/ogrenci";
  if (isHome) return pathname === base;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function PortalShell({
  role,
  email,
  portalLabel,
  portalKind,
  density,
  presentation,
  children,
}: {
  role: AppRole;
  email: string | null;
  portalLabel: string;
  portalKind: PortalKind;
  density: Density;
  /** İş 3 — "standard" | "glass". <1024px + bu prop "glass" olduğunda chrome cam yüzeye geçer; masaüstünde her zaman standart. */
  presentation: PortalPresentation;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const navItems = PORTAL_NAV[portalKind];
  const mobileItems = navItems.filter((i) => i.mobile).slice(0, 5);

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }} data-portal-presentation={presentation}>
      <header
        className="glass-chrome sticky top-0 z-30 border-b backdrop-blur"
        style={{ borderColor: "var(--chrome-border)", background: "var(--chrome-bg)" }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 lg:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" style={{ color: "var(--chrome-text)" }}>
              {portalLabel}
            </p>
          </div>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Portal navigasyonu">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition", active ? "font-semibold" : "hover:opacity-80")}
                  style={active ? { background: "var(--chrome-active-bg)", color: "var(--chrome-active-text)" } : { color: "var(--chrome-text-muted)" }}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <NotificationBell role={role} />
            <UserMenu email={email} role={role} kurumName={null} initialDensity={density} />
          </div>
        </div>
      </header>

      <main className="pb-20 md:pb-6">{children}</main>

      <nav
        className="glass-chrome portal-bottom-nav fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t md:hidden"
        style={{ borderColor: "var(--chrome-border)", background: "var(--chrome-bg)" }}
        aria-label="Alt navigasyon"
      >
        {mobileItems.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="glass-tap flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium"
              style={{ color: active ? "var(--chrome-icon-active)" : "var(--chrome-icon)" }}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
