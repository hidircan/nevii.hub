"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePanelNav } from "@/components/panel-nav-context";
import { mergeNavOrder } from "@/lib/nav/order";
import { actionSaveNavOrder, actionSaveSidebarCollapsed } from "@/lib/actions";
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

/**
 * Masaüstü kolonu ve mobil drawer'ın PAYLAŞTIĞI nav gövdesi — menü sırası,
 * yetkiler ve işlemler TEK kaynaktan render edilir (ikinci bir navigasyon
 * altyapısı yok). Drawer her zaman geniş (`collapsed=false`) açılır:
 * masaüstü daraltma tercihi mobil menüye taşınmaz.
 */
function SidebarNavBody({
  pathname,
  role,
  collapsed,
  userKey,
  initialNavOrder,
  canViewFinanceAndStaffSummary,
  canViewTeacherEarnings,
}: {
  pathname: string;
  role?: SessionRole;
  collapsed: boolean;
  userKey: string;
  initialNavOrder?: Record<string, string[]>;
  canViewFinanceAndStaffSummary: boolean;
  canViewTeacherEarnings: boolean;
}) {
  return (
    <>
      <nav aria-label="Panel bölümleri" className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-4">
        <NavSection sectionKey="main" items={PANEL_MAIN_NAV} pathname={pathname} role={role} collapsed={collapsed} userKey={userKey} serverOrder={initialNavOrder?.main} />
        <NavSection sectionKey="finance" title="Finans" items={canViewTeacherEarnings ? PANEL_FINANCE_NAV : PANEL_FINANCE_NAV.filter((item) => item.href !== "/panel/hakedisler")} pathname={pathname} role={role} collapsed={collapsed} userKey={userKey} serverOrder={initialNavOrder?.finance} />
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
    </>
  );
}

export function Sidebar({
  role,
  kurumlar: _kurumlar,
  kurumSelection: _kurumSelection,
  canSeeAllKurumlar: _canSeeAllKurumlar,
  canViewFinanceAndStaffSummary = true,
  canViewTeacherEarnings = true,
  userKey = "anon",
  initialNavOrder,
  initialCollapsed = false,
}: {
  role?: SessionRole;
  kurumlar?: unknown;
  kurumSelection?: string;
  canSeeAllKurumlar?: boolean;
  canViewFinanceAndStaffSummary?: boolean;
  /** Kurum hakediş politikası (access.teacherEarningsAccess) — sunucuda çözülür. */
  canViewTeacherEarnings?: boolean;
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
  const { mobileOpen, closeMobileNav, menuButtonRef } = usePanelNav();
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const wasMobileOpenRef = useRef(false);

  // Dar/geniş mod tercihi — yalnız görsel, kalıcı (localStorage). Yalnız
  // MASAÜSTÜNDE (lg+) render edilir; mobil drawer bu state'i hiç okumaz
  // (her zaman geniş açılır) — iki state birbirine karışmaz.
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

  const toggleCollapsed = useCallback(() => {
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
  }, [userKey]);

  // Sınır şeridi düğmesinin dikey konumu — hover'ı takip eder (yakında
  // belirir), hover yokken/klavyede ortada durur. Piksel hesabı render
  // sırasında DEĞİL fare olayında yapılır (state'e yazan effect yok).
  const edgeStripRef = useRef<HTMLDivElement>(null);
  const [edgeButtonTop, setEdgeButtonTop] = useState<number | null>(null);

  function handleEdgeMouseMove(e: React.MouseEvent) {
    const rect = edgeStripRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return;
    const margin = 20;
    const y = Math.min(Math.max(e.clientY - rect.top, margin), rect.height - margin);
    setEdgeButtonTop(y);
  }

  // Mobil drawer: gerçek navigasyonda kapanır (pathname değişimi). Alt menü
  // açma benzeri bir etkileşim bu menüde YOK (sürükle-bırak sıralama fare
  // olaylarıdır, tıklama değil) — tıklama ile kapatma yalnız anchor'a
  // yapılır (bkz. handleDrawerClick).
  useEffect(() => {
    closeMobileNav();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız route değişiminde kapanır
  }, [pathname]);

  // Escape ile kapatma.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMobileNav();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, closeMobileNav]);

  // Açıkken arka plan scroll kilidi: gövde + panel içi kaydırıcı birlikte
  // kilitlenir (içerik `main` içinde kayar, gövdede değil). `overflow`
  // değişimi scroll konumunu SIFIRLAMAZ — kapanınca konum korunur.
  useEffect(() => {
    if (!mobileOpen) return;
    const bodyPrev = document.body.style.overflow;
    const main = document.getElementById("panel-main");
    const mainPrev = main?.style.overflow;
    document.body.style.overflow = "hidden";
    if (main) main.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bodyPrev;
      if (main && mainPrev !== undefined) main.style.overflow = mainPrev;
    };
  }, [mobileOpen]);

  // Odak yönetimi: açılışta drawer kapatma düğmesine alınır, kapanışta
  // menüyü açan düğmeye döner.
  useEffect(() => {
    if (mobileOpen) {
      wasMobileOpenRef.current = true;
      drawerCloseRef.current?.focus({ preventScroll: true });
    } else if (wasMobileOpenRef.current) {
      wasMobileOpenRef.current = false;
      menuButtonRef.current?.focus({ preventScroll: true });
    }
  }, [mobileOpen, menuButtonRef]);

  // Ekran lg'ye genişleyince drawer state'i sıfırlanır — overlay/scroll
  // kilidi takılı kalmaz (CSS zaten `lg:hidden` ile gizler, bu JS
  // tarafındaki kilit/effect temizliği içindir).
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    function onChange(e: MediaQueryListEvent) {
      if (e.matches) closeMobileNav();
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [closeMobileNav]);

  // Drawer içinde GERÇEK navigasyon tıklaması → kapat. Sürükle-bırak
  // tutamaçları/div tıklamaları anchor değildir, menü açık kalır.
  function handleDrawerClick(e: React.MouseEvent) {
    const el = e.target as HTMLElement;
    if (typeof el.closest === "function" && el.closest("a[href]")) closeMobileNav();
  }


  const edgeLabel = collapsed ? "Menüyü genişlet" : "Menüyü daralt";

  return (
    <>
    <aside
      className={cn("relative hidden shrink-0 flex-col border-r transition-[width] lg:flex", collapsed ? "w-[72px]" : "w-64")}
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
        aria-label={edgeLabel}
        aria-expanded={!collapsed}
        title={edgeLabel}
        className="absolute top-6 -right-3 z-10 hidden h-6 w-6 items-center justify-center rounded-full border shadow-sm transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 lg:inline-flex"
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
       * Sınır şeridi — sidebar ile içerik arasındaki dikey sınır boyunca
       * (yalnız lg+) dar ama rahat bir hover hedefi (24px, sınırın iki
       * yanına 12'şer px: içte nav padding'inde, dışta içerik padding'inde
       * kalır — ne nav bağlantı metnini ne de içeriği örter). Hover'da
       * sınır vurgulanır ve yön oklu düğme hover konumuna yakın belirir;
       * düğme şeridin içinde kaldığı için hover titremez. Klavyede her
       * zaman odaklanılabilir (görünmezken tıklanamaz ama Tab ile erişilir,
       * focus-visible ile görünür olur). Üstteki düğme ile AYNI state'i
       * (`toggleCollapsed`) kullanır — o düğme dokunmatik/klavye alternatifi
       * olarak kalır. Üstteki düğmenin alanını örtmemek için şerit top-14'ten
       * başlar. Genişlik sürükleme DEĞİL, yalnız daralt/genişlet.
       */}
      <div
        ref={edgeStripRef}
        onMouseMove={handleEdgeMouseMove}
        onMouseLeave={() => setEdgeButtonTop(null)}
        className="group/edge absolute bottom-0 top-14 -right-3 z-0 hidden w-6 lg:block"
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 opacity-0 transition-opacity group-hover/edge:opacity-100 group-focus-within/edge:opacity-100"
          style={{ background: "var(--color-primary)" }}
        />
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={edgeLabel}
          aria-expanded={!collapsed}
          title={edgeLabel}
          className="pointer-events-none absolute left-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border p-0 opacity-0 shadow-sm transition-opacity group-hover/edge:pointer-events-auto group-hover/edge:opacity-100 group-focus-within/edge:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          style={{
            top: edgeButtonTop ?? "50%",
            background: "var(--color-surface)",
            borderColor: "var(--color-border)",
            color: "var(--color-text-muted)",
            ["--tw-ring-color" as string]: "var(--color-focus-ring)",
          }}
        >
          {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

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
            9. tur (2026-09-27, owner) — marka alanı yalnız tipografi: "NeviiHub"
            Gloock ile (`.brand-mark` → `--font-gloock`, next/font + Georgia
            fallback). Önceki kutulu/arka planlı `/brand/logo.png` menüden
            kaldırıldı (favicon/login dokunulmadı). Şeffaf "icon 2.png"
            önerisi denetlendi: dosya RGB, alfa kanalı YOK (beyaz zemin) —
            bu yüzden kullanılmadı. Gloock tek ağırlıklıdır (400); `font-bold`
            sahte kalınlaştırma üreteceği için verilmez. Daraltılmış menüde
            aynı yazı tipiyle "N" monogramı (kutusuz) gösterilir.
          */}
          {collapsed ? (
            <span aria-hidden className="brand-mark text-[1.6rem] leading-none" style={{ color: "var(--color-primary)" }}>
              N
            </span>
          ) : (
            <p
              className="brand-mark truncate text-[1.75rem] font-normal leading-none"
              style={{ color: "var(--color-primary)", letterSpacing: "-0.01em" }}
            >
              {BRAND.name}
            </p>
          )}
        </div>
      </div>

      <SidebarNavBody
        pathname={pathname}
        role={role}
        collapsed={collapsed}
        userKey={userKey}
        initialNavOrder={initialNavOrder}
        canViewFinanceAndStaffSummary={canViewFinanceAndStaffSummary}
        canViewTeacherEarnings={canViewTeacherEarnings}
      />
    </aside>

    {/*
     * Mobil/tablet (<lg) drawer — içeriği sıkıştıran kalıcı kolon DEĞİL,
     * overlay drawer. Header'ın ALTINDA açılır (header z-40, DOM'da sonra
     * geldiği için üstte kalır): menü düğmesi görünür kalır ve X'e dönüşüp
     * kapatır. Karartma yalnız açıkken render edilir (kapalıyken görünmez
     * katman içerik tıklamalarını engellemez). Kapalıyken drawer DOM'da
     * durur ama hem ekran dışındadır hem `inert` + `aria-hidden` ile
     * odak/okuyucu ağacından çıkar — erişilemeyen odaklanılabilir link
     * kalmaz. Yükseklik `dvh` (mobil tarayıcı chrome'u), alt kenar
     * safe-area ile korunur.
     */}
    {mobileOpen ? (
      <div
        aria-hidden="true"
        onClick={closeMobileNav}
        className="fixed inset-0 z-30 bg-black/40 lg:hidden"
      />
    ) : null}
    <aside
      id="panel-mobile-nav"
      role="dialog"
      aria-modal="true"
      aria-label="Ana menü"
      aria-hidden={!mobileOpen}
      inert={!mobileOpen}
      onClick={handleDrawerClick}
      className={cn(
        "fixed left-0 top-0 z-40 flex h-dvh w-[min(20rem,calc(100vw-3rem))] flex-col border-r transition-transform duration-200 ease-out lg:hidden",
        mobileOpen ? "translate-x-0" : "pointer-events-none -translate-x-full"
      )}
      style={{
        background: "var(--color-bg)",
        borderColor: "var(--color-border)",
        color: "var(--color-text)",
      }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-b px-4 pb-4"
        style={{
          borderColor: "var(--color-border)",
          paddingTop: "calc(60px + env(safe-area-inset-top, 0px))",
        }}
      >
        <p
          className="brand-mark truncate text-2xl font-normal leading-none"
          style={{ color: "var(--color-primary)", letterSpacing: "-0.01em" }}
        >
          {BRAND.name}
        </p>
        <button
          ref={drawerCloseRef}
          type="button"
          onClick={closeMobileNav}
          aria-label="Menüyü kapat"
          title="Menüyü kapat"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
          style={{
            background: "var(--color-surface)",
            borderColor: "var(--color-border)",
            color: "var(--color-text-muted)",
          }}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <SidebarNavBody
          pathname={pathname}
          role={role}
          collapsed={false}
          userKey={userKey}
          initialNavOrder={initialNavOrder}
          canViewFinanceAndStaffSummary={canViewFinanceAndStaffSummary}
          canViewTeacherEarnings={canViewTeacherEarnings}
        />
      </div>
    </aside>
    </>
  );
}
