/**
 * A — ÇALIŞMA GÜNÜ TEK KAYNAĞI + zorla aç / zorla kapat.
 *
 * Kök sorun: "bu gün açık mı?" sorusunun beş ayrı cevabı vardı ve yalnızca
 * Yoklama Takvimi yöneticinin istisnalarını görüyordu. Bu test, aynı gün için
 * planlama doğrulaması, seri planlama, ücret önizlemesi ve takvim statüsünün
 * TEK ve AYNI cevabı ürettiğini doğrular.
 */
import { describe, it, expect } from "vitest";
import { resolveWorkDay, assertWorkDaySchedulable, resolveDayStatus } from "../work-days";
import { validateLessonSlot } from "../makeup-engine";
import { countExactWeekdayLessons } from "../period-lesson-billing";
import type { AppData, ClosedDay } from "../types";

const HOLIDAY = "2026-10-29"; // Cumhuriyet Bayramı — Perşembe
const NORMAL_OPEN = "2026-10-22"; // normal Perşembe, açık
const MONDAY = "2026-10-26"; // Güz döneminde haftalık kapalı gün

function override(date: string, isOpen: boolean, name = ""): ClosedDay {
  return {
    id: `cld_${date}`,
    date,
    name,
    kind: "custom",
    isOpen,
    createdBy: "u_test",
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
  };
}

function appData(overrides: ClosedDay[]): AppData {
  return {
    settings: { lessonDurationMinutes: 40 },
    lessons: [],
    teachers: [],
    rooms: [],
    students: [{ id: "s1", termType: "guz" }],
    closedDayOverrides: overrides,
  } as unknown as AppData;
}

function slot(data: AppData, ymd: string) {
  return validateLessonSlot(
    data,
    { instrument: "Piyano", studentId: "s1" },
    { teacherId: "t1", roomId: "r1", startAt: `${ymd}T12:00:00.000Z` }
  );
}

const at = (ymd: string) => new Date(`${ymd}T09:00:00.000Z`);

describe("zorla açık — normalde kapalı bir gün planlanabilir hale gelir", () => {
  it("resmî tatil istisnasız KAPALI ve planlanamaz", () => {
    const day = resolveWorkDay(at(HOLIDAY), "guz", []);
    expect(day.status).toBe("closed");
    expect(day.reason).toBe("official_holiday");
    expect(day.schedulable).toBe(false);

    const res = slot(appData([]), HOLIDAY);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("DAY_CLOSED");
  });

  it("zorla açık işaretlenince AYNI gün planlanabilir olur", () => {
    const forced = [override(HOLIDAY, true, "Bayram telafi günü")];
    const day = resolveWorkDay(at(HOLIDAY), "guz", forced);
    expect(day.status).toBe("open");
    expect(day.reason).toBe("manual_open");
    expect(day.schedulable).toBe(true);
    expect(day.explanation).toMatch(/zorla açık/);

    const res = slot(appData(forced), HOLIDAY);
    // Gün artık engel değil — kalan hata öğretmen/oda fixture'ının yokluğundan gelir.
    expect(res.ok ? "ok" : res.code).not.toBe("DAY_CLOSED");
  });

  it("haftalık kapalı gün (Güz/Pazartesi) de zorla açılabilir", () => {
    expect(resolveWorkDay(at(MONDAY), "guz", []).reason).toBe("term_weekly_closed");
    expect(resolveWorkDay(at(MONDAY), "guz", []).schedulable).toBe(false);
    expect(resolveWorkDay(at(MONDAY), "guz", [override(MONDAY, true)]).schedulable).toBe(true);
  });
});

describe("zorla kapalı — normalde açık bir gün engellenir", () => {
  it("normal bir Perşembe açıkken planlanabilir", () => {
    const day = resolveWorkDay(at(NORMAL_OPEN), "guz", []);
    expect(day.status).toBe("open");
    expect(day.schedulable).toBe(true);
  });

  it("zorla kapalı işaretlenince planlanamaz ve neden + çözüm yazılır", () => {
    const forced = [override(NORMAL_OPEN, false, "Kurum içi eğitim")];
    const day = resolveWorkDay(at(NORMAL_OPEN), "guz", forced);
    expect(day.status).toBe("closed");
    expect(day.reason).toBe("manual_closed");
    expect(day.schedulable).toBe(false);

    const guard = assertWorkDaySchedulable(at(NORMAL_OPEN), "guz", forced);
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.message).toMatch(/Kurum içi eğitim/);
      expect(guard.message).toMatch(/Zorla açık/); // nasıl düzeltilir
    }

    const res = slot(appData(forced), NORMAL_OPEN);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("DAY_CLOSED");
      expect(res.dayReason).toBe("manual_closed");
    }
  });
});

describe("aynı kaynak: takvim, planlama ve ücret önizlemesi ayrışmaz", () => {
  it("takvim statüsü ile planlama guard'ı her koşulda aynı cevabı verir", () => {
    const cases: ClosedDay[][] = [[], [override(HOLIDAY, true)], [override(NORMAL_OPEN, false)], [override(MONDAY, true)]];
    for (const overrides of cases) {
      for (const ymd of [HOLIDAY, NORMAL_OPEN, MONDAY]) {
        const calendar = resolveDayStatus(at(ymd), "guz", overrides);
        const planning = assertWorkDaySchedulable(at(ymd), "guz", overrides);
        expect(planning.ok).toBe(calendar.status === "open");
      }
    }
  });

  it("ücret önizlemesi kapalı günü saymaz, zorla açılan günü sayar", () => {
    // Ekim 2026 Perşembeleri: 1, 8, 15, 22, 29 → 29'u resmî tatil.
    expect(countExactWeekdayLessons("2026-10-01", "2026-10-31", [4], { term: "guz", overrides: [] })).toBe(4);
    expect(
      countExactWeekdayLessons("2026-10-01", "2026-10-31", [4], {
        term: "guz",
        overrides: [override(HOLIDAY, true)],
      })
    ).toBe(5);
    expect(
      countExactWeekdayLessons("2026-10-01", "2026-10-31", [4], {
        term: "guz",
        overrides: [override(HOLIDAY, true), override(NORMAL_OPEN, false)],
      })
    ).toBe(4);
  });
});

describe("KATI KURAL — haftalık kapalı gün yalnız 'zorla açık' ile açılır", () => {
  /**
   * Owner kararı (2026-09-20): Pazartesi gibi haftalık kapalı günlerde
   * planlama KATI şekilde engellenir. Tek kaçış yolu yöneticinin "zorla
   * açık" istisnasıdır — başka hiçbir katman (ders oluşturma, taşıma,
   * toplu revizyon) kendi gevşek kuralını UYGULAYAMAZ.
   *
   * Bu test, kuralın üç ayrı yolda da TEK kaynaktan geldiğini kaynak kodu
   * üzerinden doğrular: `isWeeklyClosedDayForTerm`i doğrudan çağıran bir
   * kontrol kalmamalı (o fonksiyon `isOpen` istisnasını GÖRMEZ).
   */
  const files = [
    "src/lib/services/tools.ts",
    "src/lib/lesson-update.ts",
    "src/lib/lesson-scope-edit.ts",
    "src/lib/lesson-scheduling.ts",
  ];

  it("hiçbir planlama yolu kendi hafta günü kuralını uygulamaz", async () => {
    const { readFileSync } = await import("fs");
    const path = await import("path");
    const root = path.resolve(import.meta.dirname, "../../..");
    for (const file of files) {
      const code = readFileSync(path.join(root, file), "utf-8");
      // Yorum satırları hariç, GERÇEK bir çağrı kalmamalı.
      const calls = code
        .split("\n")
        .filter((line) => /isWeeklyClosedDayForTerm\s*\(/.test(line) && !line.trim().startsWith("*") && !line.trim().startsWith("//"));
      expect({ file, calls }).toEqual({ file, calls: [] });
    }
  });

  it("zorla açık Pazartesi: hem oluşturma hem taşıma guard'ı geçer", () => {
    const monday = at(MONDAY);
    const forced = [override(MONDAY, true, "Bayram telafisi")];
    expect(assertWorkDaySchedulable(monday, "guz", []).ok).toBe(false);
    expect(assertWorkDaySchedulable(monday, "guz", forced).ok).toBe(true);
  });

  it("zorla açık OLMAYAN Pazartesi'de hata, nedeni VE çözümü söyler", () => {
    const guard = assertWorkDaySchedulable(at(MONDAY), "guz", []);
    expect(guard.ok).toBe(false);
    if (guard.ok) return;
    expect(guard.message).toMatch(/Pazartesi/);
    expect(guard.message).toMatch(/kurumun haftalık kapalı günü/);
    expect(guard.message).toMatch(/Çalışma Günleri/);
    expect(guard.message).toMatch(/Zorla açık/);
  });
});
