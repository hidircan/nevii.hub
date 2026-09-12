"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { mergeNavOrder } from "@/lib/nav/order";
import { actionSaveNavOrder, actionSaveSidebarCollapsed } from "@/lib/actions";
import { LogoutButton } from "@/components/logout-button";
import Image from "next/image";
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
/**
 * P1 (2026-09-11) — sıra anahtarı KULLANICI-ad-alanlıdır: aynı cihazda
 * başka kullanıcı giriş yaptığında önceki kullanıcının sırası ASLA
 * okunmaz (Ezgi/Nihal ayrımı). Server kaydı (hesap) gerçek kaynaktır;
 * localStorage yalnız anlık önbellektir.
 */
function orderStorageKey(userKey: string, sectionKey: string): string {
  return `notaplan_sidebar_order_${userKey}_${sectionKey}`;
}

function applyOrderList(order: string[] | undefined, items: PanelNavItem[]): PanelNavItem[] {
  const byHref = new Map(items.map((item) => [item.href, item]));
  const ordered: PanelNavItem[] = [];
  for (const href of mergeNavOrder(order, items.map((i) => i.href))) {
    const item = byHref.get(href);
    if (item) ordered.push(item);
  }
  return ordered;
}

function applyStoredOrder(userKey: string, sectionKey: string, items: PanelNavItem[]): PanelNavItem[] {
  try {
    const raw = window.localStorage.getItem(orderStorageKey(userKey, sectionKey));
    if (!raw) return items;
    const order = JSON.parse(raw) as string[];
    return applyOrderList(order, items);
  } catch {
    return items;
  }
}

type SessionRole = "SUPER_ADMIN" | "SCHOOL_ADMIN" | "AI_AGENT" | "TEACHER" | "STUDENT";

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
  userKey,
  serverOrder,
}: {
  /** Sürükle-bırak sırasının saklanacağı anahtar (bölüme + kullanıcıya özgü). */
  sectionKey: string;
  title?: string;
  items: PanelNavItem[];
  pathname: string;
  role?: SessionRole;
  collapsed: boolean;
  /** Hesap-ad-alanlı önbellek anahtarı + server sırası (yoksa varsayılan). */
  userKey: string;
  serverOrder?: string[];
}) {
  const [ordered, setOrdered] = useState(() => applyOrderList(serverOrder, items));
  const [dragHref, setDragHref] = useState<string | null>(null);

  useEffect(() => {
    // SSR ile ilk render her zaman server/prop sırasını kullanır (hydration
    // uyumu); anlık localStorage önbelleği yalnız mount SONRASI uygulanır.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage senkron, yalnız mount'ta bir kez
    setOrdered(applyStoredOrder(userKey, sectionKey, applyOrderList(serverOrder, items)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey]);

  const visible = ordered.filter((item) => isVisibleForRole(item, role));
  if (visible.length === 0) return null;

  function persistOrder(next: PanelNavItem[]) {
    setOrdered(next);
    const hrefs = next.map((i) => i.href);
    try {
      window.localStorage.setItem(orderStorageKey(userKey, sectionKey), JSON.stringify(hrefs));
    } catch {
      // sessizce yoksay — sıra kalıcı olmaz ama uygulama çalışmaya devam eder.
    }
    void actionSaveNavOrder(sectionKey, hrefs);
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
  role,
  kurumlar: _kurumlar,
  kurumSelection: _kurumSelection,
  canSeeAllKurumlar: _canSeeAllKurumlar,
  canViewFinanceAndStaffSummary = true,
  userKey = "anon",
  initialNavOrder,
  initialCollapsed = false,
}: {
  role?: SessionRole;
  kurumlar?: unknown;
  kurumSelection?: string;
  canSeeAllKurumlar?: boolean;
  canViewFinanceAndStaffSummary?: boolean;
  /** Hesap-ad-alanlı önbellek anahtarı (userId). */
  userKey?: string;
  /** Hesap kaydından gelen bölüm sıraları. */
  initialNavOrder?: Record<string, string[]>;
  /** Hesap kaydından gelen dar/geniş tercihi. */
  initialCollapsed?: boolean;
}) {
  void _kurumlar;
  void _kurumSelection;
  void _canSeeAllKurumlar;
  const pathname = usePathname();

  // Dar/geniş mod tercihi — yalnız görsel, kalıcı (localStorage). Mobilde
  // toggle hiç render edilmez (bkz. aşağıdaki `hidden md:inline-flex`) —
  // mobil deneyim bu değişiklikten etkilenmez.
  // P1 (2026-09-11) — ilk değer: server tercihi + hesap-ad-alanlı anlık
  // önbellek (lazy initializer: SSR'de server değeri → hydration uyumlu;
  // istemcide önbellek varsa o). Bileşen kullanıcı başına `key` ile
  // yeniden kurulur (bkz. panel layout), bu yüzden effect GEREKMEZ.
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return initialCollapsed;
    try {
      const cached = window.localStorage.getItem(`${SIDEBAR_COLLAPSED_KEY}_${userKey}`);
      return cached !== null ? cached === "1" : initialCollapsed;
    } catch {
      return initialCollapsed;
    }
  });

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(`${SIDEBAR_COLLAPSED_KEY}_${userKey}`, next ? "1" : "0");
        document.cookie = `${SIDEBAR_COLLAPSED_KEY}=${next ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      } catch {
        // sessizce yoksay — tercih kalıcı olmaz ama uygulama çalışmaya devam eder.
      }
      void actionSaveSidebarCollapsed(next);
      return next;
    });
  }


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

      {/*
       * İş 1 (bu sprint) — marka alanında yalnız logomark + kelime markası
       * kalır. Daha önce burada bir kurum-adı/rol kartı vardı
       * (`{roleLabel} · {userLabel}` — roleLabel çağıran layout'tan HAM
       * enum değeriyle geliyordu, ör. "SCHOOL_ADMIN", Türkçeleştirilmemiş
       * "School Admin" benzeri metnin kaynağı buydu). O bilgi kaybolmadı:
       * kurum adı zaten `UserMenu` dropdown'ında (`{roleLabelTr(role)} ·
       * {kurumName}`) gösteriliyor — burada ikinci kez, çevrilmemiş
       * biçimde tekrar edilmiyor.
       */}
      <div className="border-b px-3 py-5" style={{ borderColor: "var(--color-border)" }}>
        <div
          className={cn("flex items-center gap-2.5", collapsed && "justify-center")}
          {...(collapsed ? { role: "img", "aria-label": BRAND.name } : {})}
        >
          {/*
            P0 UAT (2026-09-08) — "NH" monogramı yerine kurumun GERÇEK ikonu.
            Kaynak `BRAND.logoMarkPath` (= /brand/logo.png); bu dosya
            `src/app/icon.png` ile BYTE OLARAK AYNIDIR (sha256 doğrulandı),
            yani favicon ile aynı görseldir — yeni/rastgele bir logo
            ÜRETİLMEDİ. Favicon/PWA/login logosu DEĞİŞTİRİLMEDİ.

            `next/image` sabit boyutla kullanılır: retina için srcset'i kendisi
            üretir ve 1,1 MB'lık kaynağı ikon boyutuna indirir. Görsel tema
            değişkenlerinden bağımsızdır, bu yüzden açık/koyu temada aynı
            görünür; `priority` YOK — sidebar LCP adayı değil.
          */}
          {BRAND.logoMarkPath ? (
            <Image
              src={BRAND.logoMarkPath}
              alt=""
              aria-hidden
              width={collapsed ? 28 : 32}
              height={collapsed ? 28 : 32}
              className={cn("shrink-0 rounded-md object-contain", collapsed ? "h-7 w-7" : "h-8 w-8")}
            />
          ) : (
            /* Asset yoksa metin kısaltmasına düşülür — kırık görsel gösterilmez. */
            <span
              aria-hidden
              className={cn(
                "flex shrink-0 items-center justify-center rounded-md font-extrabold uppercase text-white",
                collapsed ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm"
              )}
              style={{ background: "var(--color-primary)" }}
            >
              {BRAND.name.slice(0, 2)}
            </span>
          )}
          {/*
            P1 revizyonu — marka yazımı her yerde tam olarak "NeviiHub".
            Buradaki `uppercase` sınıfı, tr yerel ayarında "NEVİİHUB"
            (noktalı büyük İ) üretiyordu — kaynak metin doğruydu, görsel
            dönüşüm yanlıştı. Sınıf kaldırıldı; kaynak metin korunur.
          */}
          {!collapsed ? (
            <p
              className="truncate text-[1.7rem] font-extrabold tracking-tight"
              style={{ color: "var(--color-primary)" }}
            >
              {BRAND.name}
            </p>
          ) : null}
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        <NavSection sectionKey="main" items={PANEL_MAIN_NAV} pathname={pathname} role={role} collapsed={collapsed} userKey={userKey} serverOrder={initialNavOrder?.main} />
        <NavSection sectionKey="finance" title="Finans" items={PANEL_FINANCE_NAV} pathname={pathname} role={role} collapsed={collapsed} userKey={userKey} serverOrder={initialNavOrder?.finance} />
        <NavSection
          sectionKey="ops"
          title="Operasyonlar"
          items={
            canViewFinanceAndStaffSummary
              ? PANEL_OPS_NAV
              : PANEL_OPS_NAV.filter((item) => item.href !== "/panel/personel" && item.href !== "/panel/finans-ozeti")
          }
          pathname={pathname}
          role={role}
          collapsed={collapsed}
          userKey={userKey}
          serverOrder={initialNavOrder?.ops}
        />
        <NavSection sectionKey="ai" title="Yapay Zeka" items={PANEL_AI_NAV} pathname={pathname} role={role} collapsed={collapsed} userKey={userKey} serverOrder={initialNavOrder?.ai} />
      </nav>

      <div className="space-y-3 border-t px-3 py-4" style={{ borderColor: "var(--color-border)" }}>
        <NavSection sectionKey="system" title="Sistem" items={PANEL_SYSTEM_NAV} pathname={pathname} role={role} collapsed={collapsed} userKey={userKey} serverOrder={initialNavOrder?.system} />
        <div className={cn("pt-1", collapsed ? "px-0 text-center" : "px-3")}>
          <LogoutButton className="!text-xs" />
        </div>
      </div>
    </aside>
  );
}
