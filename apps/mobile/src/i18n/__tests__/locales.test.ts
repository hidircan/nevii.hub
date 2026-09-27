import { describe, expect, it, vi } from "vitest";
import { allPaths, interpolate, lookup, STRINGS } from "../locales";
import { coerceLocale, getActiveLocale, isLocale, setActiveLocale } from "../locale-store";

const secureMemory = vi.hoisted(() => ({ data: new Map<string, string>() }));

vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => secureMemory.data.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    secureMemory.data.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secureMemory.data.delete(key);
  },
}));

function leaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(leaves);
  }
  return [];
}

describe("i18n sözlük paritesi", () => {
  it("en sözlüğü tr ile birebir aynı anahtarları taşır", () => {
    const trPaths = allPaths(STRINGS.tr).sort();
    const enPaths = allPaths(STRINGS.en).sort();
    expect(enPaths).toEqual(trPaths);
    expect(trPaths.length).toBeGreaterThan(0);
  });

  it("hiçbir yaprak değer boş değildir", () => {
    for (const path of allPaths()) {
      expect(lookup("tr", path).length, path).toBeGreaterThan(0);
      expect(lookup("en", path).length, path).toBeGreaterThan(0);
    }
  });

  it("bilinmeyen anahtar önce Türkçe'ye, o da yoksa anahtara düşer", () => {
    expect(lookup("en", "common.back")).toBe("Back");
    expect(lookup("en", "yok.boyle.bir.anahtar")).toBe("yok.boyle.bir.anahtar");
  });

  it("enterpolasyon {ad} yer tutucularını doldurur", () => {
    expect(interpolate("Merhaba {ad}", { ad: "Elif" })).toBe("Merhaba Elif");
    expect(interpolate("Hi {name}", {})).toBe("Hi {name}");
  });
});

describe("locale kalıcılığı", () => {
  it("persist/load SecureStore üzerinden dili taşır", async () => {
    const store = await import("../locale-store");
    await store.persistLocale("en");
    store.setActiveLocale("tr");
    expect(await store.loadStoredLocale()).toBe("en");
    expect(store.getActiveLocale()).toBe("en");
    await store.persistLocale("tr");
  });
});

describe("locale-store", () => {
  it("varsayılan dil Türkçe'dir ve yalnız tr/en kabul edilir", () => {
    setActiveLocale("tr");
    expect(getActiveLocale()).toBe("tr");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(coerceLocale("en")).toBe("en");
    expect(coerceLocale("de")).toBe("tr");
    expect(coerceLocale(undefined)).toBe("tr");
  });

  it("setActiveLocale dili değiştirir", () => {
    setActiveLocale("en");
    expect(getActiveLocale()).toBe("en");
    setActiveLocale("tr");
    expect(getActiveLocale()).toBe("tr");
  });
});

describe("yerelleştirilmiş yardımcılar", () => {
  it("tarih adları aktif dile göre üretilir", async () => {
    const date = await import("../../lib/date");
    setActiveLocale("tr");
    // 4 Ekim 2026 Pazar günüdür.
    expect(date.weekdayName(new Date(2026, 9, 4))).toBe("Pazar");
    expect(date.relativeDayLabel(new Date(2026, 9, 4), new Date(2026, 9, 4))).toBe("Bugün");
    setActiveLocale("en");
    expect(date.weekdayName(new Date(2026, 9, 4))).toBe("Sunday");
    expect(date.shortDayMonth(new Date(2026, 7, 26))).toBe("26 Aug");
    expect(date.relativeDayLabel(new Date(2026, 9, 4), new Date(2026, 9, 4))).toBe("Today");
    setActiveLocale("tr");
  });

  it("para biçimi tutarı korur, gruplamayı dile göre yapar", async () => {
    const date = await import("../../lib/date");
    setActiveLocale("tr");
    const trValue = date.formatCurrency(1250);
    setActiveLocale("en");
    const enValue = date.formatCurrency(1250);
    expect(trValue).toContain("1.250");
    expect(enValue).toContain("1,250");
    setActiveLocale("tr");
  });

  it("rozet etiketleri aktif dile göre üretilir", async () => {
    const attendance = await import("../../lib/attendance-display");
    const status = await import("../../lib/lesson-status");
    const makeup = await import("../../lib/makeup-view");
    setActiveLocale("tr");
    expect(attendance.ledgerStatusBadge("attended").label).toBe("Geldi");
    expect(makeup.makeupStatusBadge("pending").label).toBe("Bekliyor");
    setActiveLocale("en");
    expect(attendance.ledgerStatusBadge("attended").label).toBe("Present");
    expect(attendance.ledgerStatusBadge("pending").label).toBe("Not yet finalized");
    expect(makeup.makeupStatusBadge("pending").label).toBe("Pending");
    expect(
      status.lessonStatusBadge({ status: "cancelled" } as never).label,
    ).toBe("Cancelled");
    setActiveLocale("tr");
  });
});
