"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Briefcase, Columns3, Mail, Settings, Users } from "lucide-react";

const TABS = [
  { href: "/panel/ik", label: "Özet", icon: BarChart3, exact: true },
  { href: "/panel/ik/adaylar", label: "Aday havuzu", icon: Users },
  { href: "/panel/ik/pano", label: "Süreç panosu", icon: Columns3 },
  { href: "/panel/ik/ilanlar", label: "İlanlar", icon: Briefcase },
  { href: "/panel/ik/sablonlar", label: "E-posta şablonları", icon: Mail },
  { href: "/panel/ik/ayarlar", label: "Ayarlar", icon: Settings },
];

export function IkTabs() {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="İnsan kaynakları" className="mb-6 -mx-1 flex gap-1 overflow-x-auto border-b border-[var(--color-border)] pb-px print:hidden">
      {TABS.map((t) => {
        const active = t.exact ? path === t.href : path.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
              active
                ? "border-[var(--color-primary)] text-[var(--color-text)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <Icon className="h-4 w-4" /> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
