/**
 * Günlük Özet kişisel düzen tercihleri — rol varsayılanı + kullanıcı override.
 *
 * Owner kuralı: dashboard kullanıcıya göre kişiselleşir; hakediş bloğu yalnız
 * SUPER_ADMIN'e gösterilir (tercihte olsa bile rol kapısı aşılmaz).
 */

import type { DashboardPreferences, DashboardSavedView, DashboardSectionSpan } from "../user-preferences";
import {
  getScreenWidget,
  isScreenWidgetKey,
  permittedScreenWidgets,
  type ScreenWidgetAccess,
  type ScreenWidgetKey,
} from "./screen-widgets";

export type { DashboardSectionSpan };

export const DASHBOARD_SECTION_KEYS = [
  "actions",
  "notes",
  "metrics",
  "todaySchedule",
  "trials",
  "collections",
  "contracts",
  "branchLoad",
  "tasks",
  "payout",
] as const;

export type BuiltinDashboardSectionKey = (typeof DASHBOARD_SECTION_KEYS)[number];
/** Yerleşik bölüm veya "Widget ekle" ile eklenen menü ekranı (`screen:*`). */
export type DashboardSectionKey = BuiltinDashboardSectionKey | ScreenWidgetKey;

export const DASHBOARD_SECTION_LABELS: Record<BuiltinDashboardSectionKey, string> = {
  actions: "Aksiyon gerekli",
  notes: "Notlar",
  metrics: "Rakamlar şeridi",
  todaySchedule: "Bugünün programı",
  trials: "Deneme dersleri",
  collections: "Tahsilat",
  contracts: "Sözleşme",
  branchLoad: "Şube yoğunluğu",
  tasks: "İş takip",
  payout: "Hakediş",
};

/** İzinli xl kolon genişlikleri — kenardan boyutlandırma bu aralığa oturtulur. */
export const DASHBOARD_MIN_SPAN = 3;
export const DASHBOARD_MAX_SPAN = 12;
const ALLOWED_SPANS = new Set<number>([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

/** Serbest sayıyı (sürükleme sonucu) izinli genişliğe oturtur. */
export function clampDashboardSpan(value: number): DashboardSectionSpan {
  const rounded = Math.round(Number.isFinite(value) ? value : DASHBOARD_MAX_SPAN);
  return Math.min(DASHBOARD_MAX_SPAN, Math.max(DASHBOARD_MIN_SPAN, rounded)) as DashboardSectionSpan;
}

export function dashboardSectionLabel(key: DashboardSectionKey): string {
  return (DASHBOARD_SECTION_LABELS as Record<string, string>)[key] ?? getScreenWidget(key)?.label ?? key;
}

const SCREEN_WIDGET_DEFAULT_SPAN: DashboardSectionSpan = 4;

const DEFAULT_SPANS: Record<BuiltinDashboardSectionKey, DashboardSectionSpan> = {
  actions: 12,
  notes: 5,
  metrics: 12,
  todaySchedule: 7,
  trials: 5,
  collections: 5,
  contracts: 5,
  branchLoad: 4,
  /** Eski sabit düzen 3'tü; izinli aralık 4|5|6|7|8|12 — en yakın dar. */
  tasks: 4,
  payout: 12,
};

function defaultSpan(key: DashboardSectionKey): DashboardSectionSpan {
  return (DEFAULT_SPANS as Record<string, DashboardSectionSpan>)[key] ?? SCREEN_WIDGET_DEFAULT_SPAN;
}

const ALL_ORDER: DashboardSectionKey[] = [...DASHBOARD_SECTION_KEYS];
const NON_OWNER_ORDER: DashboardSectionKey[] = ALL_ORDER.filter((k) => k !== "payout");

export function isDashboardSectionKey(value: string): value is DashboardSectionKey {
  return (DASHBOARD_SECTION_KEYS as readonly string[]).includes(value) || isScreenWidgetKey(value);
}

/**
 * Kullanıcının eklediği widget'lardan HÂLÂ yetkili ve katalogda olanlar —
 * yetkisi düşen veya menüden kalkan ekran sessizce görünmez olur.
 */
export function resolveAddedWidgets(
  stored: string[] | undefined | null,
  access: ScreenWidgetAccess
): ScreenWidgetKey[] {
  const permitted = new Set(permittedScreenWidgets(access).map((w) => w.key));
  const out: ScreenWidgetKey[] = [];
  for (const raw of Array.isArray(stored) ? stored : []) {
    if (typeof raw === "string" && permitted.has(raw as ScreenWidgetKey) && !out.includes(raw as ScreenWidgetKey)) {
      out.push(raw as ScreenWidgetKey);
    }
  }
  return out;
}

export function isOwnerRole(role: string | undefined | null): boolean {
  return role === "SUPER_ADMIN";
}

/** Rol bazlı varsayılan düzen (kullanıcı kaydı yokken). */
export function getDefaultDashboardLayout(role: string | undefined | null): {
  order: DashboardSectionKey[];
  hidden: DashboardSectionKey[];
  spans: Record<DashboardSectionKey, DashboardSectionSpan>;
} {
  return {
    order: isOwnerRole(role) ? [...ALL_ORDER] : [...NON_OWNER_ORDER],
    hidden: [],
    spans: { ...DEFAULT_SPANS } as Record<DashboardSectionKey, DashboardSectionSpan>,
  };
}

export type ResolvedDashboardSection = {
  key: DashboardSectionKey;
  span: DashboardSectionSpan;
  label: string;
};

export type ResolvedDashboardLayout = {
  /** Görünür bölümler, kullanıcı/rol sırasıyla. */
  visible: ResolvedDashboardSection[];
  /** Editör listesi: tüm rol-izinli bölümler (gizli olanlar dahil). */
  editable: Array<ResolvedDashboardSection & { hidden: boolean }>;
  order: DashboardSectionKey[];
  hidden: DashboardSectionKey[];
  spans: Record<DashboardSectionKey, DashboardSectionSpan>;
  /** Yetkili ve hâlâ katalogda olan eklenmiş ekran widget'ları. */
  addedWidgets: ScreenWidgetKey[];
};

/**
 * Rol varsayılanı + kullanıcı override. `payout` non-owner için her zaman
 * düşer — tercihte olsa bile gösterilmez / düzenlenmez.
 */
export function resolveDashboardLayout(
  prefs: DashboardPreferences | undefined | null,
  role: string | undefined | null,
  access: ScreenWidgetAccess = { role }
): ResolvedDashboardLayout {
  const defaults = getDefaultDashboardLayout(role);
  const addedWidgets = resolveAddedWidgets(prefs?.addedWidgets, access);
  const baseOrder = [...defaults.order, ...addedWidgets];
  const allowed = new Set(baseOrder);

  const order = mergeSectionOrder(prefs?.sectionOrder, baseOrder).filter((k) => allowed.has(k));

  const hiddenRaw = Array.isArray(prefs?.hiddenSections) ? prefs!.hiddenSections! : [];
  const hidden = hiddenRaw.filter((k): k is DashboardSectionKey => isDashboardSectionKey(k) && allowed.has(k));
  const hiddenSet = new Set(hidden);

  const spans: Record<DashboardSectionKey, DashboardSectionSpan> = { ...defaults.spans };
  const storedSpans = prefs?.sectionSpans;
  if (storedSpans && typeof storedSpans === "object") {
    for (const [key, value] of Object.entries(storedSpans)) {
      if (!isDashboardSectionKey(key) || !allowed.has(key)) continue;
      if (ALLOWED_SPANS.has(value as number)) {
        spans[key] = value as DashboardSectionSpan;
      }
    }
  }

  const editable = order.map((key) => ({
    key,
    span: spans[key] ?? defaultSpan(key),
    label: dashboardSectionLabel(key),
    hidden: hiddenSet.has(key),
  }));

  const visible = editable
    .filter((s) => !s.hidden)
    .map(({ key, span, label }) => ({ key, span, label }));

  return { visible, editable, order, hidden, spans, addedWidgets };
}

/** Kayıtlı sıra + varsayılanlar: ölü anahtar düşer, eksik sona eklenir. */
export function mergeSectionOrder(
  stored: string[] | undefined | null,
  defaults: DashboardSectionKey[]
): DashboardSectionKey[] {
  if (!stored || stored.length === 0) return [...defaults];
  const live = new Set(defaults);
  const seen = new Set<DashboardSectionKey>();
  const ordered: DashboardSectionKey[] = [];
  for (const raw of stored) {
    if (!isDashboardSectionKey(raw) || !live.has(raw) || seen.has(raw)) continue;
    ordered.push(raw);
    seen.add(raw);
  }
  for (const key of defaults) {
    if (!seen.has(key)) ordered.push(key);
  }
  return ordered;
}

/**
 * Kayda yazılacak sıra: yetkili anahtarlar kendi sırasıyla + eksik YERLEŞİK
 * bölümler sona. Eklenmemiş ekran widget'ları sıraya kendiliğinden girmez.
 */
function mergeStoredOrder(stored: string[] | undefined, allowedKeys: Set<DashboardSectionKey>): DashboardSectionKey[] {
  const builtins = [...allowedKeys].filter((k) => !isScreenWidgetKey(k));
  const mentioned = (stored ?? []).filter((k): k is DashboardSectionKey => allowedKeys.has(k as DashboardSectionKey));
  return mergeSectionOrder(mentioned, [...builtins, ...mentioned.filter(isScreenWidgetKey)]);
}

export type DashboardLayoutPatch = {
  hiddenSections?: string[];
  sectionOrder?: string[];
  sectionSpans?: Record<string, number>;
  savedViews?: DashboardSavedView[];
  /** null → seçili görünüm kalkar, canlı düzen kalır. */
  activeViewId?: string | null;
  /** true → layout alanlarını sil; defaultBranchId ve savedViews korunur. */
  resetToDefault?: boolean;
  /** Eklenmiş ekran widget'larının TAM listesi (yetkisizler düşer). */
  addedWidgets?: string[];
};

const VIEW_ID = /^[a-zA-Z0-9_-]{1,40}$/;

function sanitizeSavedViews(
  views: DashboardSavedView[] | undefined,
  allowedKeys: Set<DashboardSectionKey>
): DashboardSavedView[] | undefined {
  if (!views) return undefined;
  const out: DashboardSavedView[] = [];
  const seen = new Set<string>();
  for (const view of views.slice(0, 12)) {
    const id = typeof view?.id === "string" ? view.id : "";
    const name = typeof view?.name === "string" ? view.name.trim().slice(0, 40) : "";
    if (!VIEW_ID.test(id) || !name || seen.has(id)) continue;
    seen.add(id);
    const order = mergeStoredOrder(view.sectionOrder, allowedKeys);
    const hiddenSeen = new Set<string>();
    const hidden = (view.hiddenSections ?? []).filter((k) => {
      if (!isDashboardSectionKey(k) || !allowedKeys.has(k) || hiddenSeen.has(k)) return false;
      hiddenSeen.add(k);
      return true;
    });
    const spans: Record<string, DashboardSectionSpan> = {};
    for (const [key, value] of Object.entries(view.sectionSpans ?? {})) {
      if (!isDashboardSectionKey(key) || !allowedKeys.has(key)) continue;
      if (ALLOWED_SPANS.has(value)) spans[key] = value;
    }
    out.push({ id, name, sectionOrder: order, hiddenSections: hidden, sectionSpans: spans });
  }
  return out;
}

/**
 * Kayda yazılmadan önce sanitize. Non-owner `payout` anahtarını tüm
 * alanlardan düşürür. Geçersiz span/anahtar sessizce yok sayılır.
 */
export function sanitizeDashboardLayoutPatch(
  patch: DashboardLayoutPatch,
  role: string | undefined | null,
  access: ScreenWidgetAccess = { role }
): Omit<DashboardPreferences, "defaultBranchId"> | { clearLayout: true } {
  if (patch.resetToDefault) return { clearLayout: true };

  const allowedKeys = new Set<DashboardSectionKey>([
    ...getDefaultDashboardLayout(role).order,
    ...permittedScreenWidgets(access).map((w) => w.key),
  ]);
  const out: Omit<DashboardPreferences, "defaultBranchId"> = {};

  if (patch.sectionOrder !== undefined) {
    out.sectionOrder = mergeStoredOrder(patch.sectionOrder, allowedKeys);
  }

  if (patch.hiddenSections !== undefined) {
    const seen = new Set<string>();
    out.hiddenSections = patch.hiddenSections.filter((k) => {
      if (!isDashboardSectionKey(k) || !allowedKeys.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  if (patch.sectionSpans !== undefined) {
    const spans: Record<string, DashboardSectionSpan> = {};
    for (const [key, value] of Object.entries(patch.sectionSpans)) {
      if (!isDashboardSectionKey(key) || !allowedKeys.has(key)) continue;
      if (ALLOWED_SPANS.has(value)) spans[key] = value as DashboardSectionSpan;
    }
    out.sectionSpans = spans;
  }

  if (patch.savedViews !== undefined) {
    out.savedViews = sanitizeSavedViews(patch.savedViews, allowedKeys) ?? [];
  }

  if (patch.addedWidgets !== undefined) {
    out.addedWidgets = resolveAddedWidgets(patch.addedWidgets, access);
  }

  if (patch.activeViewId !== undefined) {
    if (patch.activeViewId === null || patch.activeViewId === "") {
      out.activeViewId = undefined;
    } else if (VIEW_ID.test(patch.activeViewId)) {
      out.activeViewId = patch.activeViewId;
    }
  }

  return out;
}

/** Mevcut dashboard prefs + sanitize edilmiş layout yaması. */
export function mergeDashboardPreferences(
  prev: DashboardPreferences | undefined,
  sanitized: Omit<DashboardPreferences, "defaultBranchId"> | { clearLayout: true }
): DashboardPreferences {
  if ("clearLayout" in sanitized) {
    const next: DashboardPreferences = {};
    if (prev?.defaultBranchId !== undefined) next.defaultBranchId = prev.defaultBranchId;
    if (prev?.savedViews !== undefined) next.savedViews = prev.savedViews;
    return next;
  }

  return {
    ...(prev ?? {}),
    ...sanitized,
  };
}

/**
 * UAT 2026-09-24 (E) — geniş ekranda "masonry" yerleşim: ızgara satır izi
 * `DASHBOARD_ROW_UNIT_PX`, her kart ölçülen yüksekliği (+ alt boşluk) kadar iz
 * kaplar. `grid-flow-dense` böylece kısa kartın altındaki boşluğa sonraki kartı
 * YUKARIDAN yerleştirir; eskiden satır en uzun kart kadar yüksekti ve sonraki
 * kart o satırın tamamının altına atılıyordu. Kayıt biçimi (sıra + genişlik)
 * değişmez — kayıtlı düzenler migration'sız çalışır.
 */
export const DASHBOARD_ROW_UNIT_PX = 4;
export const DASHBOARD_ROW_GAP_PX = 10;

export function dashboardRowSpan(heightPx: number): number {
  return Math.max(1, Math.ceil((Math.max(0, heightPx) + DASHBOARD_ROW_GAP_PX) / DASHBOARD_ROW_UNIT_PX));
}
