import { describe, it, expect } from "vitest";
import {
  DASHBOARD_SECTION_KEYS,
  getDefaultDashboardLayout,
  mergeDashboardPreferences,
  mergeSectionOrder,
  resolveDashboardLayout,
  sanitizeDashboardLayoutPatch,
} from "../dashboard/layout-prefs";

describe("dashboard layout defaults by role", () => {
  it("SUPER_ADMIN varsayılanında payout vardır", () => {
    const layout = getDefaultDashboardLayout("SUPER_ADMIN");
    expect(layout.order).toEqual([...DASHBOARD_SECTION_KEYS]);
    expect(layout.order).toContain("payout");
    expect(layout.hidden).toEqual([]);
    expect(layout.spans.todaySchedule).toBe(7);
    expect(layout.spans.collections).toBe(5);
    expect(layout.spans.tasks).toBe(4);
    expect(layout.spans.payout).toBe(12);
  });

  it("SCHOOL_ADMIN varsayılanında payout yoktur", () => {
    const layout = getDefaultDashboardLayout("SCHOOL_ADMIN");
    expect(layout.order).not.toContain("payout");
    expect(layout.order).toEqual(DASHBOARD_SECTION_KEYS.filter((k) => k !== "payout"));
  });

  it("bilinmeyen rol de payout'suz varsayılan alır", () => {
    expect(getDefaultDashboardLayout("TEACHER").order).not.toContain("payout");
    expect(getDefaultDashboardLayout(undefined).order).not.toContain("payout");
  });
});

describe("resolveDashboardLayout — kullanıcı override + rol kapısı", () => {
  it("kayıt yoksa rol varsayılanını döner", () => {
    const resolved = resolveDashboardLayout(undefined, "SUPER_ADMIN");
    expect(resolved.visible.map((s) => s.key)).toEqual([...DASHBOARD_SECTION_KEYS]);
    expect(resolved.hidden).toEqual([]);
  });

  it("hiddenSections görünür listeden düşer; sıra korunur", () => {
    const resolved = resolveDashboardLayout(
      {
        sectionOrder: ["metrics", "actions", "todaySchedule", "collections", "contracts", "branchLoad", "tasks"],
        hiddenSections: ["metrics", "branchLoad"],
      },
      "SCHOOL_ADMIN"
    );
    expect(resolved.visible.map((s) => s.key)).toEqual([
      "actions",
      "todaySchedule",
      "collections",
      "contracts",
      "tasks",
    ]);
    expect(resolved.hidden).toEqual(["metrics", "branchLoad"]);
    expect(resolved.order[0]).toBe("metrics");
  });

  it("sectionSpans geçerli değerleri uygular; geçersizleri yok sayar", () => {
    const resolved = resolveDashboardLayout(
      {
        sectionSpans: {
          todaySchedule: 8,
          collections: 3 as never,
          fake: 12,
        },
      },
      "SCHOOL_ADMIN"
    );
    expect(resolved.spans.todaySchedule).toBe(8);
    expect(resolved.spans.collections).toBe(5);
    expect(resolved.visible.find((s) => s.key === "todaySchedule")?.span).toBe(8);
  });

  it("non-owner tercihte payout olsa bile göstermez / düzenletmez", () => {
    const resolved = resolveDashboardLayout(
      {
        sectionOrder: ["payout", "actions", "metrics"],
        hiddenSections: [],
        sectionSpans: { payout: 12 },
      },
      "SCHOOL_ADMIN"
    );
    expect(resolved.order).not.toContain("payout");
    expect(resolved.visible.map((s) => s.key)).not.toContain("payout");
    expect(resolved.editable.map((s) => s.key)).not.toContain("payout");
  });

  it("ölü anahtar düşer; eksik varsayılanlar sona eklenir", () => {
    expect(mergeSectionOrder(["contracts", "ghost", "actions"], ["actions", "metrics", "contracts"])).toEqual([
      "contracts",
      "actions",
      "metrics",
    ]);
  });
});

describe("sanitize + merge persistence", () => {
  it("resetToDefault layout alanlarını siler, defaultBranchId korunur", () => {
    const merged = mergeDashboardPreferences(
      {
        defaultBranchId: "evka3",
        hiddenSections: ["metrics"],
        sectionOrder: ["collections", "actions"],
        sectionSpans: { actions: 12 },
      },
      sanitizeDashboardLayoutPatch({ resetToDefault: true }, "SUPER_ADMIN")
    );
    expect(merged).toEqual({ defaultBranchId: "evka3" });
  });

  it("reset kayıtlı görünümleri silmez", () => {
    const merged = mergeDashboardPreferences(
      {
        defaultBranchId: "evka3",
        savedViews: [
          {
            id: "v_sabah",
            name: "Sabah",
            sectionOrder: ["actions"],
            hiddenSections: [],
            sectionSpans: { actions: 12 },
          },
        ],
        activeViewId: "v_sabah",
      },
      sanitizeDashboardLayoutPatch({ resetToDefault: true }, "SUPER_ADMIN")
    );
    expect(merged.savedViews).toHaveLength(1);
    expect(merged.activeViewId).toBeUndefined();
    expect(merged.sectionOrder).toBeUndefined();
  });

  it("kayıtlı görünüm adı ve payout rol kapısı sanitize edilir", () => {
    const sanitized = sanitizeDashboardLayoutPatch(
      {
        savedViews: [
          {
            id: "v_ok",
            name: "  Operasyon  ",
            sectionOrder: ["payout", "actions"],
            hiddenSections: ["payout"],
            sectionSpans: { actions: 6, payout: 12 },
          },
        ],
        activeViewId: "v_ok",
      },
      "SCHOOL_ADMIN"
    );
    if ("clearLayout" in sanitized) throw new Error("unexpected");
    expect(sanitized.savedViews?.[0]?.name).toBe("Operasyon");
    expect(sanitized.savedViews?.[0]?.sectionOrder).not.toContain("payout");
    expect(sanitized.savedViews?.[0]?.hiddenSections).toEqual([]);
    expect(sanitized.activeViewId).toBe("v_ok");
  });

  it("sanitize non-owner payout anahtarını düşürür", () => {
    const sanitized = sanitizeDashboardLayoutPatch(
      {
        sectionOrder: ["payout", "actions", "bogus"],
        hiddenSections: ["payout", "metrics"],
        sectionSpans: { payout: 12, actions: 8, metrics: 9 },
      },
      "SCHOOL_ADMIN"
    );
    expect(sanitized).not.toHaveProperty("clearLayout");
    if ("clearLayout" in sanitized) throw new Error("unexpected");
    expect(sanitized.sectionOrder).not.toContain("payout");
    expect(sanitized.sectionOrder?.[0]).toBe("actions");
    expect(sanitized.hiddenSections).toEqual(["metrics"]);
    expect(sanitized.sectionSpans).toEqual({ actions: 8 });
  });

  it("kısmi yama önceki dashboard alanlarını korur", () => {
    const merged = mergeDashboardPreferences(
      { defaultBranchId: "erzene", sectionOrder: ["actions"] },
      sanitizeDashboardLayoutPatch({ hiddenSections: ["tasks"] }, "SUPER_ADMIN")
    );
    expect(merged.defaultBranchId).toBe("erzene");
    expect(merged.sectionOrder).toEqual(["actions"]);
    expect(merged.hiddenSections).toEqual(["tasks"]);
  });
});
