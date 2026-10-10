"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function TenantTabs({ tenantId }: { tenantId: string }) {
  const pathname = usePathname();
  const base = `/platform/kurumlar/${tenantId}`;
  const tabs = [
    { href: base, label: "Genel Bakış" },
    { href: `${base}/paket`, label: "Paket & Limit" },
    { href: `${base}/ozellikler`, label: "Modüller" },
    { href: `${base}/kullanicilar`, label: "Kullanıcı & Rol" },
    { href: `${base}/gorunum`, label: "Marka & Görünüm" },
    { href: `${base}/formlar`, label: "Formlar" },
    { href: `${base}/politikalar`, label: "Politikalar" },
    { href: `${base}/mobil`, label: "Mobil" },
    { href: `${base}/roller`, label: "Özel Roller" },
    { href: `${base}/surumler`, label: "Sürümler" },
    { href: `${base}/ayarlar`, label: "Operasyon Ayarları" },
    { href: `${base}/entegrasyonlar`, label: "Entegrasyonlar" },
    { href: `${base}/destek`, label: "Destek Erişimi" },
    { href: `${base}/denetim`, label: "Denetim" },
  ];
  return (
    <div
      className="mb-6 flex flex-wrap gap-1 border-b"
      style={{ borderColor: "var(--color-border)" }}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium",
              active
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
