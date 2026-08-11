import { CommandPalette } from "@/components/command-palette";
import { UserMenu } from "@/components/user-menu";
import type { AppRole } from "@/lib/auth/types";
import type { Density } from "@/lib/theme";

/**
 * İş 1 — kompakt, sticky panel header. İçerik akışının DIŞINDA (main'in
 * scroll ettiği içerik div'inden ayrı, `sticky top-0`) yaşar; bu yüzden
 * sayfa başlıkları/breadcrumb (`PageHeader`, her sayfanın kendi `<Link>
 * geri</Link>` düzeni) hiç etkilenmez — onlar hâlâ aşağıdaki içerik
 * kapsayıcısının içinde, olduğu gibi render edilir.
 */
export function PanelHeader({
  role,
  email,
  kurumName,
  density,
}: {
  role: AppRole;
  email: string | null;
  kurumName: string | null;
  density: Density;
}) {
  return (
    <header
      className="panel-header sticky top-0 z-30 flex items-center justify-end gap-2 border-b px-6 py-2.5 backdrop-blur lg:px-10"
      style={{ borderColor: "var(--color-border)", background: "color-mix(in srgb, var(--color-surface) 92%, transparent)" }}
    >
      <CommandPalette role={role} />
      <UserMenu email={email} role={role} kurumName={kurumName} initialDensity={density} />
    </header>
  );
}
