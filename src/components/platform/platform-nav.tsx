"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type PlatformNavLink = { href: string; label: string; group: string | null };

type NavState = "current" | "ancestor" | "idle";

/**
 * Menü seçim durumu.
 *
 * Kök neden notu: eski `isActive` yalnızca taban yolu önekiyle eşleşiyordu;
 * `/platform/fatura` üzerinde "Kurum Abonelikleri" + "Başvurular…" +
 * "Kampanyalar" (üçü de aynı taban) aynı anda seçili görünüyordu — "düğme
 * basılı kalmış" izlenimi. Şimdi tek `current` + silik `ancestor` ayrımı var:
 * - current: tam eşleşme (yol + gerekiyorsa #çapa). Tek vurgulu öğe.
 * - ancestor: current'ın üst yolu (örn. e-Belgeler sayfasında Abonelikler).
 *   Yalnız metin rengiyle belli olur; zemin vurgusu YOK.
 * - idle: normal.
 * `:active` basma efekti tarayıcının anlık durumudur; seçim vurgusundan ayrıdır.
 * Klavye odağı korunur (outline kaldırılmaz, blur hilesi yok).
 */
function useNavStates(links: PlatformNavLink[]): Map<string, NavState> {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [pathname]);

  const states = new Map<string, NavState>();
  const baseOf = (href: string) => href.split("#")[0] ?? href;
  const hashOf = (href: string) => (href.includes("#") ? href.slice(href.indexOf("#")) : "");

  // 1. current: en uzun eşleşen href kazanır (çapa uyumu dahil).
  let currentHref: string | null = null;
  let currentLen = -1;
  for (const link of links) {
    const base = baseOf(link.href);
    const h = hashOf(link.href);
    const baseMatch = base === "/platform" ? pathname === "/platform" : pathname === base || pathname.startsWith(`${base}/`);
    if (!baseMatch) continue;
    if (h && h !== hash) continue;
    // Çapasız bağ, çapa seçiliyken current olamaz (örn. #basvurular açıkken Abonelikler).
    if (!h && hash && pathname === base && links.some((o) => o.href !== link.href && baseOf(o.href) === base && hashOf(o.href) === hash)) {
      continue;
    }
    if (link.href.length > currentLen) {
      currentLen = link.href.length;
      currentHref = link.href;
    }
  }
  // 2. ancestor: current'ın katı üst yolu olan çapasız bağlar.
  for (const link of links) {
    if (link.href === currentHref) {
      states.set(link.href, "current");
      continue;
    }
    const base = baseOf(link.href);
    const curBase = currentHref ? baseOf(currentHref) : null;
    if (
      currentHref &&
      !hashOf(link.href) &&
      base !== "/platform" &&
      curBase &&
      curBase !== base &&
      (curBase === base || curBase.startsWith(`${base}/`) || (curBase === pathname && base === pathname && hash))
    ) {
      states.set(link.href, "ancestor");
    } else {
      states.set(link.href, "idle");
    }
  }
  return states;
}

const desktopCls = (s: NavState) =>
  cn(
    "block rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors",
    s === "current" && "bg-[var(--color-surface-muted)] font-semibold text-[var(--color-primary)]",
    s === "ancestor" && "text-[var(--color-primary)]",
    s === "idle" && "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
  );

const mobileCls = (s: NavState) =>
  cn(
    "whitespace-nowrap rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs font-medium transition-colors",
    s === "current" && "bg-[var(--color-surface-muted)] font-semibold text-[var(--color-primary)]",
    s === "ancestor" && "text-[var(--color-primary)]",
    s === "idle" && "text-[var(--color-text-muted)]"
  );

const NAV_OPEN_KEY = "neviios-nav-open";

/** Bağlantılar sunucuda ekran registry'si + permission resolver ile üretilir (layout.tsx). */
export function PlatformNav({ links }: { links: PlatformNavLink[] }) {
  const states = useNavStates(links);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(NAV_OPEN_KEY);
    } catch {
      /* depolama yoksa açık kalır */
    }
    if (stored !== "0") return;
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, []);
  function toggle(next: boolean) {
    setOpen(next);
    try {
      window.localStorage.setItem(NAV_OPEN_KEY, next ? "1" : "0");
    } catch {
      /* yoksay */
    }
  }
  const items = links.map((link, i) => ({
    link,
    showGroup: Boolean(link.group) && (i === 0 || links[i - 1]?.group !== link.group),
  }));
  if (!open) {
    return (
      <aside
        aria-label="Kapalı platform menüsü"
        className="hidden w-12 shrink-0 flex-col items-center border-r py-3 md:flex"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <button
          type="button"
          onClick={() => toggle(true)}
          aria-expanded="false"
          aria-label="Menüyü aç"
          title="Menüyü aç"
          className="rounded-[var(--radius-md)] px-2 py-2 text-lg leading-none text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
        >
          <span aria-hidden="true">»</span>
        </button>
      </aside>
    );
  }
  return (
    <aside
      className="hidden w-60 shrink-0 flex-col border-r md:flex"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div className="flex items-center justify-end gap-2 border-b px-4 py-2" style={{ borderColor: "var(--color-border)" }}>
        <button
          type="button"
          onClick={() => toggle(false)}
          aria-expanded="true"
          aria-label="Menüyü daralt"
          title="Menüyü daralt"
          className="rounded-[var(--radius-md)] px-2 py-1 text-lg leading-none text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
        >
          <span aria-hidden="true">«</span>
        </button>
      </div>
      <nav aria-label="Platform bölümleri" className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map(({ link, showGroup }, i) => {
          const state = states.get(link.href) ?? "idle";
          return (
            <div key={link.href}>
              {showGroup && link.group ? (
                <div className={`flex items-center gap-2 px-3 pb-1 ${i === 0 ? "pt-1" : "pt-3"}`} role="presentation">
                  <span className="h-px flex-1" style={{ background: "var(--color-border)" }} />
                  <p className="shrink-0 text-center text-xs font-extrabold uppercase tracking-wider text-[var(--color-warning)]">
                    {link.group}
                  </p>
                  <span className="h-px flex-1" style={{ background: "var(--color-border)" }} />
                </div>
              ) : null}
              <Link href={link.href} className={desktopCls(state)} aria-current={state === "current" ? "page" : undefined}>
                {link.label}
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

/** Dar ekran: yatay kaydırmalı menü (aynı registry bağlantıları, aynı seçim mantığı). */
export function PlatformMobileNav({ links }: { links: PlatformNavLink[] }) {
  const states = useNavStates(links);
  return (
    <nav aria-label="Platform menüsü" className="flex gap-1 overflow-x-auto border-b px-4 py-2 md:hidden" style={{ borderColor: "var(--color-border)" }}>
      {links.map((link) => {
        const state = states.get(link.href) ?? "idle";
        return (
          <Link key={link.href} href={link.href} className={mobileCls(state)} aria-current={state === "current" ? "page" : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
