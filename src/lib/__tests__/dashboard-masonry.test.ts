/** UAT 2026-09-24 (E) — Günlük Özet: masonry satır izi + esnek genişlik, kayıt biçimi geriye uyumlu. */
import { describe, it, expect } from "vitest";
import {
  DASHBOARD_ROW_GAP_PX,
  DASHBOARD_ROW_UNIT_PX,
  dashboardRowSpan,
  resolveDashboardLayout,
  sanitizeDashboardLayoutPatch,
} from "../dashboard/layout-prefs";

describe("dashboardRowSpan", () => {
  it("kart yüksekliği + alt boşluğu kapsayan en küçük iz sayısı", () => {
    for (const h of [0, 1, 37, 120, 333, 1000]) {
      const span = dashboardRowSpan(h);
      expect(span * DASHBOARD_ROW_UNIT_PX).toBeGreaterThanOrEqual(h + DASHBOARD_ROW_GAP_PX);
      expect((span - 1) * DASHBOARD_ROW_UNIT_PX).toBeLessThan(h + DASHBOARD_ROW_GAP_PX);
    }
  });

  it("kısa kart uzun karttan az iz kaplar → dense akış altındaki boşluğa sonraki kartı yerleştirebilir", () => {
    const tall = dashboardRowSpan(600);
    const shortA = dashboardRowSpan(200);
    const shortB = dashboardRowSpan(250);
    // Eski davranış: ikinci kısa kart, uzun kartın bittiği yerin ALTINA düşüyordu.
    expect(shortA + shortB).toBeLessThan(tall);
  });
});

describe("kayıtlı düzen uyumu", () => {
  it("3/12 genişlik artık kaydedilir ve sayfa yeniden açılınca geri okunur", () => {
    const patch = sanitizeDashboardLayoutPatch({ sectionSpans: { collections: 3, todaySchedule: 9 } }, "SCHOOL_ADMIN");
    const resolved = resolveDashboardLayout(patch as never, "SCHOOL_ADMIN");
    expect(resolved.spans.collections).toBe(3);
    expect(resolved.spans.todaySchedule).toBe(9);
  });

  it("eski (4–12) kayıtlı düzen migration'sız aynen okunur", () => {
    const resolved = resolveDashboardLayout({ sectionSpans: { collections: 4, todaySchedule: 8 } } as never, "SCHOOL_ADMIN");
    expect(resolved.spans.collections).toBe(4);
    expect(resolved.spans.todaySchedule).toBe(8);
  });
});
