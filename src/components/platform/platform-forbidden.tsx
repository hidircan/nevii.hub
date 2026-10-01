import Link from "@/components/link";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { homePathForRole } from "@/lib/auth/role-routes";
import type { AppRole } from "@/lib/auth/types";

export function PlatformForbidden({ role }: { role: AppRole }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="text-sm font-semibold tracking-wide text-[var(--color-text-muted)]">
        {PLATFORM_BRAND.name}
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">Erişim reddedildi</h1>
      <p className="mt-3 text-sm text-[var(--color-text-muted)]">
        {PLATFORM_BRAND.productLine} alanına yalnız platform yöneticisi erişebilir. Bu istek 403
        olarak reddedildi.
      </p>
      <p className="mt-6">
        <Link
          href={homePathForRole(role)}
          className="text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          Kendi çalışma alanınıza dönün
        </Link>
      </p>
    </div>
  );
}
