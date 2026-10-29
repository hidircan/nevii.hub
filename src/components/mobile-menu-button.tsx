"use client";

import { Menu, X } from "lucide-react";
import { usePanelNav } from "@/components/panel-nav-context";

/**
 * Kompakt panel başlığındaki menü düğmesi — yalnız <lg görünür.
 * Drawer açıkken X'e dönüşür, böylece aynı düğme kapatma için de
 * kullanılabilir (drawer header'ın ALTINDA açılır, bu düğme örtülmez).
 */
export function MobileMenuButton() {
  const { mobileOpen, setMobileOpen, menuButtonRef } = usePanelNav();
  return (
    <button
      ref={menuButtonRef}
      type="button"
      onClick={() => setMobileOpen((v) => !v)}
      aria-expanded={mobileOpen}
      aria-controls="panel-mobile-nav"
      aria-label={mobileOpen ? "Menüyü kapat" : "Menüyü aç"}
      title={mobileOpen ? "Menüyü kapat" : "Menüyü aç"}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] lg:hidden"
      style={{
        borderColor: "var(--color-border)",
        color: "var(--color-text-muted)",
        background: "var(--color-surface)",
      }}
    >
      {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
    </button>
  );
}
