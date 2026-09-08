import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  applyOpsOverride,
  effectiveOpsFlag,
  pruneSettledOverrides,
  type LessonOpsFlagValue,
} from "../lesson-ops-override";
import { lessonCardStatusVisual } from "../../components/program-studio";
import { lessonCardFillStyle, ATTENDANCE_CALENDAR_COLORS } from "../attendance-calendar";
import type { Lesson } from "../types";

/**
 * P0 UAT REGRESYONU (2026-09-08) — "statü değiştirilince kartın tam arka plan
 * rengi ~10 sn sonra değişiyor".
 *
 * KÖK NEDEN: kart dolgusu `lessonCardStatusVisual(lesson)` ile SUNUCU
 * prop'undan çiziliyordu. `LessonOpsActions` kendi içinde iyimserdi ama Ders
 * Programı'na geri çağrı vermiyordu; kart yeni rengi ancak `router.refresh()`
 * → server action + revalidation + tam-tenant `readScopedData()` turu
 * bittikten SONRA alıyordu. Yani renk, en az BİR tam sunucu turu kadar
 * gecikiyordu (preview bölgesinde saniyeler).
 */
const FUTURE = "2099-01-01T10:00:00.000Z";

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: "l1", studentId: "s1", teacherId: "t1", roomId: "r1", branchId: "erzene",
    instrument: "Piyano", startAt: FUTURE, endAt: FUTURE, type: "regular", status: "scheduled",
    ...over,
  } as Lesson;
}

describe("effectiveOpsFlag — sunucu gerçeğinden etkin statü", () => {
  it("hiçbir bayrak yoksa null", () => expect(effectiveOpsFlag(lesson())).toBeNull());
  it("öncelik: Telafi > İşlendi > Geldi", () => {
    expect(effectiveOpsFlag(lesson({ opsMakeupFlag: true, lessonProcessed: true, studentAttended: true }))).toBe("makeup");
    expect(effectiveOpsFlag(lesson({ lessonProcessed: true, studentAttended: true }))).toBe("processed");
    expect(effectiveOpsFlag(lesson({ studentAttended: true }))).toBe("attended");
  });
});

describe("applyOpsOverride — kart rengi sunucu turunu BEKLEMEZ", () => {
  const cases: Array<[Exclude<LessonOpsFlagValue, null>, string]> = [
    ["attended", ATTENDANCE_CALENDAR_COLORS.attended],
    ["processed", ATTENDANCE_CALENDAR_COLORS.processed],
    ["makeup", ATTENDANCE_CALENDAR_COLORS.makeup],
  ];

  for (const [flag, color] of cases) {
    it(`${flag} seçilir seçilmez kart TAM dolgusu ${color} olur`, () => {
      const serverLesson = lesson(); // sunucu hâlâ "işaretsiz" diyor
      const beforeBg = lessonCardFillStyle(lessonCardStatusVisual(serverLesson)).backgroundColor;
      expect(beforeBg).not.toBe(color); // nötr — hatanın gözlenen hâli
      const optimistic = applyOpsOverride(serverLesson, flag);
      expect(lessonCardFillStyle(lessonCardStatusVisual(optimistic)).backgroundColor).toBe(color);
    });
  }

  it("override YOKSA ders aynen (referansı korunarak) döner", () => {
    const l = lesson();
    expect(applyOpsOverride(l, undefined)).toBe(l);
  });

  it("null override tüm bayrakları temizler (hata sonrası geri alma)", () => {
    const marked = lesson({ studentAttended: true });
    const rolledBack = applyOpsOverride(marked, null);
    expect(effectiveOpsFlag(rolledBack)).toBeNull();
    expect(lessonCardStatusVisual(rolledBack)).toBe("planned");
  });

  it("iyimser statü, dersi MUTASYONA UĞRATMAZ", () => {
    const l = lesson();
    applyOpsOverride(l, "processed");
    expect(l.lessonProcessed).toBeUndefined();
  });
});

describe("pruneSettledOverrides — başarılı yanıt iyimser durumu ESKİ propla ezmez", () => {
  it("sunucu HENÜZ yakalamadıysa override KORUNUR", () => {
    const stale = [lesson()]; // sunucu prop'u hâlâ işaretsiz
    const overrides = { l1: "attended" as LessonOpsFlagValue };
    expect(pruneSettledOverrides(overrides, stale)).toEqual(overrides);
  });

  it("sunucu yakaladığında override DÜŞER (kalıcı maskeleme yok)", () => {
    const fresh = [lesson({ studentAttended: true })];
    expect(pruneSettledOverrides({ l1: "attended" }, fresh)).toEqual({});
  });

  it("değişiklik yoksa AYNI nesne döner (gereksiz render yok)", () => {
    const overrides = { l1: "attended" as LessonOpsFlagValue };
    expect(pruneSettledOverrides(overrides, [lesson()])).toBe(overrides);
  });

  it("boş override haritası kısa devre yapar", () => {
    const empty = {};
    expect(pruneSettledOverrides(empty, [lesson()])).toBe(empty);
  });

  it("yalnız YAKALANAN ders düşer, diğerleri kalır", () => {
    const lessons = [lesson({ id: "l1", studentAttended: true }), lesson({ id: "l2" })];
    const out = pruneSettledOverrides({ l1: "attended", l2: "processed" }, lessons);
    expect(out).toEqual({ l2: "processed" });
  });
});

describe("Ders Programı bağlantısı — kaynak seviyesi kilit", () => {
  const SRC = readFileSync(
    path.resolve(import.meta.dirname, "../../components/program-studio.tsx"),
    "utf-8"
  );
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("kart görseli iyimser katmandan geçer (ham prop'tan DEĞİL)", () => {
    expect(CODE).toMatch(/lessonCardStatusVisual\(applyOpsOverride\(lesson, prunedOverrides\[lesson\.id\]\), now\)/);
    // Regresyon: doğrudan prop ile çizim geri gelmesin.
    expect(CODE).not.toMatch(/lessonCardStatusVisual\(lesson, now\)/);
  });

  it("LessonOpsActions statü ve pending geri çağrılarını alır", () => {
    expect(CODE).toContain("onStatusChange={onOpsStatusChange}");
    expect(CODE).toContain("onPendingChange={onOpsPendingChange}");
  });

  it("bekleyen kart görünür ve erişilebilir işaret taşır", () => {
    expect(CODE).toMatch(/aria-busy=\{opsPending\[lesson\.id\] \? true : undefined\}/);
    expect(CODE).toMatch(/opsPending\[lesson\.id\] \? "animate-pulse/);
  });
});

describe("LessonOpsActions — pending bildirimi ve geri alma", () => {
  const SRC = readFileSync(
    path.resolve(import.meta.dirname, "../../components/lesson-ops-actions.tsx"),
    "utf-8"
  );
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("istek başlarken/biterken pending bildirilir", () => {
    expect(CODE).toMatch(/onPendingChange\?\.\(lessonId, true\)/);
    expect(CODE).toMatch(/onPendingChange\?\.\(lessonId, false\)/);
  });

  it("hata ve bağlantı hatasında önceki statü geri yüklenir", () => {
    expect((CODE.match(/setLocal\(previous\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("erişilebilir 'kaydediliyor' geri bildirimi var", () => {
    expect(CODE).toMatch(/aria-live="polite"/);
    expect(CODE).toMatch(/kaydediliyor/);
  });
});
