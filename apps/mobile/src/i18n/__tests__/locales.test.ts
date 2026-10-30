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

describe("sözlük anahtar kapsamı", () => {
  it("kaynakta geçen her sabit tr(\"...\") anahtarı iki dilde de çözülür", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const root = path.join(__dirname, "..", "..", "..");
    const keys = new Set<string>();
    async function walk(dir: string) {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "node_modules" && e.name !== "__tests__") await walk(full);
        } else if (/\.tsx?$/.test(e.name)) {
          const src = await fs.readFile(full, "utf8");
          for (const m of src.matchAll(/(?:\btr|lookup)\(\s*(?:getActiveLocale\(\),?\s*)?["'`]([a-z][\w.]+)["'`]/g)) {
            keys.add(m[1]!);
          }
        }
      }
    }
    await walk(path.join(root, "app"));
    await walk(path.join(root, "src"));
    expect(keys.size).toBeGreaterThan(0);
    const missing: string[] = [];
    for (const key of keys) {
      if (lookup("tr", key) === key || lookup("en", key) === key) missing.push(key);
    }
    expect(missing).toEqual([]);
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

describe("portal hata mesajları", () => {
  it("aktif dile göre üretilir, bilinmeyen kod sızdırmaz", async () => {
    const mod = await import("../../components/mobile-ui/api-error-message");
    setActiveLocale("tr");
    expect(mod.portalErrorMessage("NETWORK_ERROR")).toContain("İnternet");
    expect(mod.portalErrorMessage("NOPE_X", "stack trace at foo (1:2)")).toBe(
      "Şu anda veriler yüklenemedi. Tekrar deneyin.",
    );
    setActiveLocale("en");
    expect(mod.portalErrorMessage("NETWORK_ERROR")).toContain("internet");
    expect(mod.portalErrorMessage("FORBIDDEN")).toContain("not authorized");
    expect(mod.portalErrorMessage("NOPE_X", "secret key abc")).toBe(
      "Data could not be loaded right now. Please try again.",
    );
    // Backend'in eyleme dönük mesajı korunur.
    expect(mod.portalErrorMessage("VALIDATION_ERROR", "Enter a date")).toBe("Enter a date");
    setActiveLocale("tr");
  });

  it("bildirim kategori etiketleri iki dilde de çözülür", async () => {
    const mod = await import("../../features/notifications/categories");
    expect(mod.categoryLabel("lesson_started", "tr")).toBe("Ders başladı");
    expect(mod.categoryLabel("lesson_started", "en")).toBe("Lesson started");
    expect(mod.categoryLabel("unknown_future_cat", "en")).toBe("unknown_future_cat");
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
    expect(attendance.ledgerStatusBadge("attended").label).toBe("Attended");
    expect(attendance.ledgerStatusBadge("pending").label).toBe("Not yet finalized");
    expect(makeup.makeupStatusBadge("pending").label).toBe("Pending");
    expect(
      status.lessonStatusBadge({ status: "cancelled" } as never).label,
    ).toBe("Cancelled");
    setActiveLocale("tr");
  });
});
