import { CommandPalette } from "@/components/command-palette";
import { ContextHeader } from "@/components/context-header";
import { MobileMenuButton } from "@/components/mobile-menu-button";
import { NotificationBell } from "@/components/notification-bell";
import { UserMenu } from "@/components/user-menu";
import type { AppRole } from "@/lib/auth/types";
import type { Density } from "@/lib/theme";

/**
 * İş 1 — kompakt, sticky panel header. İçerik akışının DIŞINDA (main'in
 * scroll ettiği içerik div'inden ayrı, `sticky top-0`) yaşar; bu yüzden
 * sayfa başlıkları/breadcrumb (`PageHeader`, her sayfanın kendi `<Link>
 * geri</Link>` düzeni) hiç etkilenmez — onlar hâlâ aşağıdaki içerik
 * kapsayıcısının içinde, olduğu gibi render edilir.
 *
 * İş 2 — arama solundaki boşluk artık `ContextHeader` (breadcrumb + yalnız
 * SUPER_ADMIN için aktif kurum pill'i) ile dolduruluyor; `justify-end`den
 * `justify-between`e geçildi ama yükseklik/sticky davranışı AYNI kaldı.
 */
export function PanelHeader({
  role,
  email,
  kurumName,
  kurumAvailable,
  kurumSelection,
  canSeeAllKurumlar,
  density,
  loginRole,
}: {
  role: AppRole;
  /** Giriş rolü (efektif rolden farklıysa) — yalnız etiket için. */
  loginRole?: AppRole;
  email: string | null;
  kurumName: string | null;
  kurumAvailable: { tenantId: string; name: string }[];
  kurumSelection: string;
  canSeeAllKurumlar: boolean;
  density: Density;
}) {
  return (
    <header
      className="panel-header sticky top-0 z-40 flex items-center justify-between gap-2 border-b px-4 py-2.5 backdrop-blur [padding-top:max(0.625rem,env(safe-area-inset-top))] sm:px-6 lg:px-10"
      style={{ borderColor: "var(--color-border)", background: "color-mix(in srgb, var(--color-surface) 92%, transparent)" }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <MobileMenuButton />
        <div className="min-w-0 flex-1">
          <ContextHeader
            role={role}
            kurumAvailable={kurumAvailable}
            kurumSelection={kurumSelection}
            canSeeAllKurumlar={canSeeAllKurumlar}
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <CommandPalette role={role} />
        <NotificationBell role={role} />
        <UserMenu email={email} role={role} labelRole={loginRole} kurumName={kurumName} initialDensity={density} />
      </div>
    </header>
  );
}
