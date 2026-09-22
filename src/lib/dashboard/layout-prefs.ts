/**
 * Günlük Özet kişisel düzen tercihleri — rol varsayılanı + kullanıcı override.
 *
 * Owner kuralı: dashboard kullanıcıya göre kişiselleşir; hakediş bloğu yalnız
 * SUPER_ADMIN'e gösterilir (tercihte olsa bile rol kapısı aşılmaz).
 */

import type { DashboardPreferences, DashboardSectionSpan } from "../user-preferences";

export type { DashboardSectionSpan };

export const DASHBOARD_SECTION_KEYS = [
  "actions",
  "metrics",
  "todaySchedule",
  "collections",
  "contracts",
  "branchLoad",
  "tasks",
  "payout",
] as const;

export type DashboardSectionKey = (typeof DASHBOARD_SECTION_KEYS)[number];

export const DASHBOARD_SECTION_LABELS: Record<DashboardSectionKey, string> = {
  actions: "Aksiyon gerekli",
  metrics: "Rakamlar şeridi",
  todaySchedule: "Bugünün programı",
  collections: "Tahsilat",
  contracts: "Sözleşme",
  branchLoad: "Şube yoğunluğu",
  tasks: "İş takip",
  payout: "Hakediş",
};

/** Size select labels — allowed xl col spans. */
export const DASHBOARD_SPAN_OPTIONS: { value: DashboardSectionSpan; label: string }[] = [
  { value: 4, label: "Dar (4)" },
  { value: 5, label: "Orta-dar (5)" },
  { value: 6, label: "Orta (6)" },
  { value: 7, label: "Orta-geniş (7)" },
  { value: 8, label: "Geniş (8)" },
  { value: 12, label: "Tam satır (12)" },
];

const ALLOWED_SPANS = new Set<number>([4, 5, 6, 7, 8, 12]);

const DEFAULT_SPANS: Record<DashboardSectionKey, DashboardSectionSpan> = {
  actions: 12,
  metrics: 12,
  todaySchedule: 7,
  collections: 5,
  contracts: 5,
  branchLoad: 4,
  /** Eski sabit düzen 3'tü; izinli aralık 4|5|6|7|8|12 — en yakın dar. */
  tasks: 4,
  payout: 12,
};

const ALL_ORDER: DashboardSectionKey[] = [...DASHBOARD_SECTION_KEYS];
const NON_OWNER_ORDER: DashboardSectionKey[] = ALL_ORDER.filter((k) => k !== "payout");

export function isDashboardSectionKey(value: string): value is DashboardSectionKey {
  return (DASHBOARD_SECTION_KEYS as readonly string[]).includes(value);
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
    spans: { ...DEFAULT_SPANS },
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
};

/**
 * Rol varsayılanı + kullanıcı override. `payout` non-owner için her zaman
 * düşer — tercihte olsa bile gösterilmez / düzenlenmez.
 */
export function resolveDashboardLayout(
  prefs: DashboardPreferences | undefined | null,
  role: string | undefined | null
): ResolvedDashboardLayout {
  const defaults = getDefaultDashboardLayout(role);
  const allowed = new Set(defaults.order);

  const order = mergeSectionOrder(prefs?.sectionOrder, defaults.order).filter((k) => allowed.has(k));

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
    span: spans[key] ?? DEFAULT_SPANS[key],
    label: DASHBOARD_SECTION_LABELS[key],
    hidden: hiddenSet.has(key),
  }));

  const visible = editable
    .filter((s) => !s.hidden)
    .map(({ key, span, label }) => ({ key, span, label }));

  return { visible, editable, order, hidden, spans };
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

export type DashboardLayoutPatch = {
  hiddenSections?: string[];
  sectionOrder?: string[];
  sectionSpans?: Record<string, number>;
  /** true → layout alanlarını sil, defaultBranchId korunur. */
  resetToDefault?: boolean;
};

/**
 * Kayda yazılmadan önce sanitize. Non-owner `payout` anahtarını tüm
 * alanlardan düşürür. Geçersiz span/anahtar sessizce yok sayılır.
 */
export function sanitizeDashboardLayoutPatch(
  patch: DashboardLayoutPatch,
  role: string | undefined | null
): Omit<DashboardPreferences, "defaultBranchId"> | { clearLayout: true } {
  if (patch.resetToDefault) return { clearLayout: true };

  const allowedKeys = new Set(getDefaultDashboardLayout(role).order);
  const out: Omit<DashboardPreferences, "defaultBranchId"> = {};

  if (patch.sectionOrder !== undefined) {
    out.sectionOrder = mergeSectionOrder(patch.sectionOrder, [...allowedKeys] as DashboardSectionKey[]);
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
    return next;
  }

  return {
    ...(prev ?? {}),
    ...sanitized,
  };
}
