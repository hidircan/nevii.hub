/**
 * Günlük Özet — "Widget ekle" kataloğu (2026-09-26).
 *
 * Kaynak TEK: panel sol menüsü (`panel-nav.ts`). Her menü ekranı Günlük Özet'e
 * hafif bir widget olarak eklenebilir; ekranın tamamı gömülmez. Anlamlı özeti
 * olan ekranlar (aşağıdaki `SCREEN_WIDGET_METRICS`) sayı/uyarı gösterir, diğerleri
 * temiz bir kısayoldur. Yetki = sidebar'daki görünürlük kuralı: menüde
 * göremediği ekranı kullanıcı widget olarak da ekleyemez / göremez.
 *
 * Widget'lar opt-in'dir: yalnız kullanıcının `addedWidgets` listesindekiler
 * çizilir; eski kayıtlı düzenler olduğu gibi çalışır.
 */

import {
  PANEL_AI_NAV,
  PANEL_FINANCE_NAV,
  PANEL_MAIN_NAV,
  PANEL_OPS_NAV,
  PANEL_SYSTEM_NAV,
  type PanelNavItem,
} from "../nav/panel-nav";

export const SCREEN_WIDGET_PREFIX = "screen:";
export type ScreenWidgetKey = `${typeof SCREEN_WIDGET_PREFIX}${string}`;

export type ScreenWidgetCategory = "Ana ekranlar" | "Finans" | "Operasyonlar" | "Yapay Zeka" | "Sistem";

export type ScreenWidgetDef = {
  key: ScreenWidgetKey;
  href: string;
  label: string;
  category: ScreenWidgetCategory;
  roles?: PanelNavItem["roles"];
};

/**
 * Günlük Özet'te zaten yerleşik bölümü olan veya kendisi olan ekranlar katalogda
 * yok (çift kart olmasın): Özet, Deneme Dersleri (→ "trials" bölümü).
 */
const EXCLUDED = new Set(["/panel", "/panel/deneme"]);

function keyFor(href: string): ScreenWidgetKey {
  return `${SCREEN_WIDGET_PREFIX}${href.replace(/^\/panel\//, "").replace(/\//g, "-")}`;
}

const GROUPS: Array<[ScreenWidgetCategory, PanelNavItem[]]> = [
  ["Ana ekranlar", PANEL_MAIN_NAV],
  ["Finans", PANEL_FINANCE_NAV],
  ["Operasyonlar", PANEL_OPS_NAV],
  ["Yapay Zeka", PANEL_AI_NAV],
  ["Sistem", PANEL_SYSTEM_NAV],
];

export const SCREEN_WIDGETS: ScreenWidgetDef[] = GROUPS.flatMap(([category, items]) =>
  items
    .filter((i) => !EXCLUDED.has(i.href))
    .map((i) => ({ key: keyFor(i.href), href: i.href, label: i.label, category, roles: i.roles }))
);

const BY_KEY = new Map(SCREEN_WIDGETS.map((w) => [w.key, w]));

export function getScreenWidget(key: string): ScreenWidgetDef | undefined {
  return BY_KEY.get(key as ScreenWidgetKey);
}

export function isScreenWidgetKey(key: string): key is ScreenWidgetKey {
  return BY_KEY.has(key as ScreenWidgetKey);
}

/** Sidebar'ın rol dışı ek kapıları (bkz. panel/layout.tsx → Sidebar props). */
export type ScreenWidgetAccess = {
  role: string | null | undefined;
  canViewTeacherEarnings?: boolean;
  canViewFinanceAndStaffSummary?: boolean;
};

/** Sidebar `isVisibleForRole` + layout kapılarıyla birebir aynı kural. */
export function canSeeScreenWidget(def: ScreenWidgetDef, access: ScreenWidgetAccess): boolean {
  if (def.roles && !(access.role && (def.roles as readonly string[]).includes(access.role))) return false;
  if (def.href === "/panel/hakedisler" && access.canViewTeacherEarnings === false) return false;
  if (
    (def.href === "/panel/personel" || def.href === "/panel/finans-ozeti") &&
    access.canViewFinanceAndStaffSummary === false
  ) {
    return false;
  }
  return true;
}

export function permittedScreenWidgets(access: ScreenWidgetAccess): ScreenWidgetDef[] {
  return SCREEN_WIDGETS.filter((w) => canSeeScreenWidget(w, access));
}

/** Özetin girdisi — sayfanın zaten hesapladığı şube-filtreli Günlük Özet sayıları. */
export type ScreenWidgetSummaryInput = {
  todayLessons: number;
  activeStudents: number;
  activeTeachers: number;
  openMakeups: number;
  overdueTotalLabel: string;
  overdueTotal: number;
  openTasks: number;
  /** 10. tur iş #6 — Günlük Özet'teki tek finans göstergesi (bu ay tahsilat). */
  collectedThisMonthLabel: string;
  collectedThisMonth: number;
};

export type ScreenWidgetMetric = { value: string; caption: string; tone?: "danger" | "warning" };

/**
 * Anlamlı özeti olan ekranlar. Hepsi sayfanın ZATEN yüklediği veriden türetilir
 * (ek sorgu yok) — widget eklemek dashboard'a yeni veri çekimi eklemez.
 */
const SCREEN_WIDGET_METRICS: Partial<Record<string, (s: ScreenWidgetSummaryInput) => ScreenWidgetMetric>> = {
  "/panel/program": (s) => ({ value: String(s.todayLessons), caption: "bugünkü ders" }),
  "/panel/yoklama": (s) => ({ value: String(s.todayLessons), caption: "bugünkü ders — yoklamaya git" }),
  "/panel/telafi": (s) => ({
    value: String(s.openMakeups),
    caption: "açık telafi talebi",
    tone: s.openMakeups > 0 ? "warning" : undefined,
  }),
  "/panel/ogrenciler": (s) => ({ value: String(s.activeStudents), caption: "aktif öğrenci" }),
  "/panel/ogretmenler": (s) => ({ value: String(s.activeTeachers), caption: "aktif öğretmen" }),
  "/panel/odemeler": (s) => ({
    value: s.overdueTotalLabel,
    caption: "gecikmiş ödeme",
    tone: s.overdueTotal > 0 ? "danger" : undefined,
  }),
  "/panel/is-takip": (s) => ({
    value: String(s.openTasks),
    caption: "açık iş",
    tone: s.openTasks > 0 ? "warning" : undefined,
  }),
  // 10. tur iş #6 — günlük karar için tek sayı: bu ayki tahsilat.
  // Kapsam/yetki: metrik metni şube-filtreli özetten gelir; widget'ın kendisi
  // menü görünürlüğüyle (yalnız kurum sahibi) kapılıdır.
  "/panel/finans-ozeti": (s) => ({ value: s.collectedThisMonthLabel, caption: "bu ay tahsilat" }),
};

export function screenWidgetMetric(def: ScreenWidgetDef, s: ScreenWidgetSummaryInput): ScreenWidgetMetric | null {
  return SCREEN_WIDGET_METRICS[def.href]?.(s) ?? null;
}
