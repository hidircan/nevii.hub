"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

/** Bağlantılar sunucuda ekran registry'si + permission resolver ile üretilir (layout.tsx). */
export function PlatformNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <aside
      className="hidden w-60 shrink-0 flex-col border-r md:flex"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div className="border-b px-4 py-4" style={{ borderColor: "var(--color-border)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- runtime platform logosu (fallback: build-time) */}
        <img src="/api/v1/branding/platform-logo" alt="" className="mb-2 h-8 w-auto" />
        <p className="text-xs font-semibold tracking-wide text-[var(--color-text-muted)]">
          {PLATFORM_BRAND.name}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-[var(--color-text)]">{PLATFORM_BRAND.productLine}</p>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {links.map((link) => {
          const active =
            link.href === "/platform"
              ? pathname === "/platform"
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "block rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium",
                active
                  ? "bg-[var(--color-surface-muted)] text-[var(--color-primary)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/** Dar ekran: yatay kaydırmalı menü (aynı registry bağlantıları). */
export function PlatformMobileNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Platform menüsü" className="flex gap-1 overflow-x-auto border-b px-4 py-2 md:hidden" style={{ borderColor: "var(--color-border)" }}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "whitespace-nowrap rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs font-medium",
            pathname === link.href ? "bg-[var(--color-surface-muted)] text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
