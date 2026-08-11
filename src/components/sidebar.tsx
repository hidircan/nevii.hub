"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, UserRound, Users, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";
import { BRAND } from "@/lib/brand";
import {
  PANEL_MAIN_NAV,
  PANEL_FINANCE_NAV,
  PANEL_OPS_NAV,
  PANEL_AI_NAV,
  PANEL_SYSTEM_NAV,
  isNavActive,
  type PanelNavItem,
} from "@/lib/nav/panel-nav";

/** Görsel bir tercih — kimlik doğrulama/kurum kapsamını etkilemez (theme.ts ile aynı ilke). */
const SIDEBAR_COLLAPSED_KEY = "notaplan_sidebar_collapsed";

/**
 * Paket 7 — sidebar menü öğeleri sürükle-bırak ile sıralanabilir. Sıra
 * yalnızca bu tarayıcıda, bölüm başına (`notaplan_sidebar_order_<section>`)
 * saklanır — theme/collapsed tercihiyle AYNI ilke: görsel bir tercih,
 * kimlik doğrulama/kurum/RBAC kapsamını hiç etkilemez, route/izin
 * yapısına dokunmaz (yalnızca hangi href'in hangi SIRADA göründüğünü
 * değiştirir).
 */
function orderStorageKey(sectionKey: string): string {
  return `notaplan_sidebar_order_${sectionKey}`;
}

function applyStoredOrder(sectionKey: string, items: PanelNavItem[]): PanelNavItem[] {
  try {
    const raw = window.localStorage.getItem(orderStorageKey(sectionKey));
    if (!raw) return items;
    const order = JSON.parse(raw) as string[];
    const byHref = new Map(items.map((item) => [item.href, item]));
    const ordered: PanelNavItem[] = [];
    for (const href of order) {
      const item = byHref.get(href);
      if (item) {
        ordered.push(item);
        byHref.delete(href);
      }
    }
    // Sırada olmayan (yeni eklenmiş) öğeler sona eklenir — kaybolmazlar.
    return [...ordered, ...byHref.values()];
  } catch {
    return items;
  }
}

type SessionRole = "SUPER_ADMIN" | "SCHOOL_ADMIN" | "AI_AGENT" | "TEACHER" | "PARENT" | "STUDENT";

/** Bir menü öğesi bu rolde görünür mü — `roles` verilmemişse tüm panel personeli görür. */
function isVisibleForRole(item: PanelNavItem, role?: SessionRole): boolean {
  if (!item.roles) return true;
  if (!role) return true;
  return (item.roles as readonly string[]).includes(role);
}

function NavSection({
  sectionKey,
  title,
  items,
  pathname,
  role,
  collapsed,
}: {
  /** Sürükle-bırak sırasının localStorage'da saklanacağı anahtar (bölüme özgü, benzersiz). */
  sectionKey: string;
  title?: string;
  items: PanelNavItem[];
  pathname: string;
  role?: SessionRole;
  collapsed: boolean;
}) {
  const [ordered, setOrdered] = useState(items);
  const [dragHref, setDragHref] = useState<string | null>(null);

  useEffect(() => {
    // SSR ile ilk render her zaman prop sırasını kullanır (hydration uyumu);
    // kayıtlı özel sıra yalnız mount SONRASI, istemci tarafında uygulanır.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage senkron, yalnız mount'ta bir kez
    setOrdered(applyStoredOrder(sectionKey, items));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey]);

  const visible = ordered.filter((item) => isVisibleForRole(item, role));
  if (visible.length === 0) return null;

  function persistOrder(next: PanelNavItem[]) {
    setOrdered(next);
    try {
      window.localStorage.setItem(orderStorageKey(sectionKey), JSON.stringify(next.map((i) => i.href)));
    } catch {
      // sessizce yoksay — sıra kalıcı olmaz ama uygulama çalışmaya devam eder.
    }
  }

  function onDrop(targetHref: string) {
    if (!dragHref || dragHref === targetHref) {
      setDragHref(null);
      return;
    }
    const current = [...ordered];
    const fromIdx = current.findIndex((i) => i.href === dragHref);
    const toIdx = current.findIndex((i) => i.href === targetHref);
    if (fromIdx === -1 || toIdx === -1) {
      setDragHref(null);
      return;
    }
    const [moved] = current.splice(fromIdx, 1);
    current.splice(toIdx, 0, moved!);
    persistOrder(current);
    setDragHref(null);
  }

  return (
    <div className="space-y-0.5">
      {title && !collapsed ? (
        <p
          className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          {title}
        </p>
      ) : null}
      {visible.map((item) => {
        const active = isNavActive(pathname, item.href);
        const Icon = item.icon;
        const isDragging = dragHref === item.href;
        return (
          <div
            key={`${item.href}-${item.label}`}
            draggable={!collapsed}
            onDragStart={() => setDragHref(item.href)}
            onDragOver={(e) => {
              if (!collapsed) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(item.href);
            }}
            onDragEnd={() => setDragHref(null)}
            className={cn(!collapsed && "cursor-grab active:cursor-grabbing", isDragging && "opacity-40")}
          >
            <Link
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
              className={cn(
                "panel-nav-link flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                active ? "font-semibold" : "font-normal hover:opacity-80",
                collapsed && "justify-center px-2"
              )}
              style={
                active
                  ? { background: "var(--color-primary-soft)", color: "var(--color-primary-soft-text)" }
                  : { color: "var(--color-text-muted)" }
              }
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className="h-4 w-4 shrink-0"
                style={{ color: active ? "var(--color-primary)" : "var(--color-text-muted)" }}
              />
              {!collapsed ? item.label : null}
            </Link>
          </div>
        );
      })}
    </div>
  );
}

export function Sidebar({
  schoolName,
  userLabel,
  roleLabel,
  role,
  kurumlar: _kurumlar,
  kurumSelection: _kurumSelection,
  canSeeAllKurumlar: _canSeeAllKurumlar,
}: {
  schoolName?: string;
  userLabel?: string;
  roleLabel?: string;
  /** RBAC filtresi için — `roleLabel` yalnız görsel metindir, filtre bu alanı kullanır. */
  role?: SessionRole;
  kurumlar?: unknown;
  kurumSelection?: string;
  canSeeAllKurumlar?: boolean;
}) {
  const schoolNameSafe = schoolName ?? BRAND.name;
  void _kurumlar;
  void _kurumSelection;
  void _canSeeAllKurumlar;
  const pathname = usePathname();

  // Dar/geniş mod tercihi — yalnız görsel, kalıcı (localStorage). Mobilde
  // toggle hiç render edilmez (bkz. aşağıdaki `hidden md:inline-flex`) —
  // mobil deneyim bu değişiklikten etkilenmez.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    // SSR ile ilk client render'ı HER ZAMAN "açık" (collapsed=false) üretir —
    // hydration uyuşmazlığı olmasın diye. Kayıtlı tercih yalnız mount
    // SONRASI, bilinçli olarak burada okunup uygulanır.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage senkron, yalnız mount'ta bir kez
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      // localStorage erişilemez (gizli mod vb.) — varsayılan açık modda kal.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // sessizce yoksay — tercih kalıcı olmaz ama uygulama çalışmaya devam eder.
      }
      return next;
    });
  }

  const portalLinkClass = cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:opacity-80");

  return (
    <aside
      className={cn("relative flex shrink-0 flex-col border-r transition-[width]", collapsed ? "w-[72px]" : "w-64")}
      style={{
        background: "var(--color-bg)",
        borderColor: "var(--color-border)",
        color: "var(--color-text)",
      }}
      aria-label="Ana menü"
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
        title={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
        className="absolute top-6 -right-3 z-10 hidden h-6 w-6 items-center justify-center rounded-full border shadow-sm transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 md:inline-flex"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-border)",
          color: "var(--color-text-muted)",
          ["--tw-ring-color" as string]: "var(--color-focus-ring)",
        }}
      >
        {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
      </button>

      <div className="border-b px-3 py-5" style={{ borderColor: "var(--color-border)" }}>
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          {collapsed ? (
            <p
              className="text-lg font-extrabold uppercase tracking-wide"
              style={{ color: "var(--color-primary)" }}
            >
              {BRAND.name.charAt(0)}
            </p>
          ) : (
            <div className="min-w-0">
              <p
                className="truncate text-xl font-extrabold uppercase tracking-wide"
                style={{ color: "var(--color-primary)" }}
              >
                {BRAND.name}
              </p>
              <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                Kurum yönetimi
              </p>
            </div>
          )}
        </div>
        {!collapsed ? (
          <div
            className="mt-3 rounded-lg border px-3 py-2"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
          >
            <p className="truncate text-xs font-medium" style={{ color: "var(--color-primary-soft-text)" }}>
              {schoolNameSafe}
            </p>
            <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
              {roleLabel || "Oturum"} · {userLabel || "—"}
            </p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        <NavSection sectionKey="main" items={PANEL_MAIN_NAV} pathname={pathname} role={role} collapsed={collapsed} />
        <NavSection sectionKey="finance" title="Finans" items={PANEL_FINANCE_NAV} pathname={pathname} role={role} collapsed={collapsed} />
        <NavSection sectionKey="ops" title="Operasyonlar" items={PANEL_OPS_NAV} pathname={pathname} role={role} collapsed={collapsed} />
        <NavSection sectionKey="ai" title="Yapay Zeka" items={PANEL_AI_NAV} pathname={pathname} role={role} collapsed={collapsed} />
      </nav>

      <div className="space-y-3 border-t px-3 py-4" style={{ borderColor: "var(--color-border)" }}>
        <NavSection sectionKey="system" title="Sistem" items={PANEL_SYSTEM_NAV} pathname={pathname} role={role} collapsed={collapsed} />
        <div className="space-y-0.5 px-0">
          <Link
            href="/ogretmen"
            title={collapsed ? "Öğretmen portalı" : undefined}
            aria-label="Öğretmen portalı"
            className={cn(portalLinkClass, collapsed && "justify-center px-2")}
            style={{ color: "var(--color-text-muted)" }}
          >
            <Users className="h-4 w-4 shrink-0" /> {!collapsed ? "Öğretmen portalı" : null}
          </Link>
          <Link
            href="/veli"
            title={collapsed ? "Veli portalı" : undefined}
            aria-label="Veli portalı"
            className={cn(portalLinkClass, collapsed && "justify-center px-2")}
            style={{ color: "var(--color-text-muted)" }}
          >
            <UserRound className="h-4 w-4 shrink-0" /> {!collapsed ? "Veli portalı" : null}
          </Link>
          <Link
            href="/ogrenci"
            title={collapsed ? "Öğrenci portalı" : undefined}
            aria-label="Öğrenci portalı"
            className={cn(portalLinkClass, collapsed && "justify-center px-2")}
            style={{ color: "var(--color-text-muted)" }}
          >
            <Home className="h-4 w-4 shrink-0" /> {!collapsed ? "Öğrenci portalı" : null}
          </Link>
        </div>
        <div className={cn("pt-1", collapsed ? "px-0 text-center" : "px-3")}>
          <LogoutButton className="!text-xs" />
        </div>
      </div>
    </aside>
  );
}
