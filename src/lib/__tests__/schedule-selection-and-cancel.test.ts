/**
 * 2026-09-19 — Ders Programı:
 *  C) geçmiş derse tıklamak (seçim) statü rengini değiştirmez
 *  D) seçili ders statü dolgusundan bağımsız bir vurguyla ayrışır
 *  F) iptal kuralı tek yerde; UI ve sunucu aynı kararı verir
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { lessonCancelBlockReason, canCancelLesson } from "../lesson-cancel-rules";
import { applyLessonCancel } from "../lesson-update";
import { cancelSeriesFromLesson } from "../lesson-series";
import { applyOpsOverride } from "../lesson-ops-override";
import { LESSON_SELECTED_CLASS, lessonCardStatusVisual } from "../../components/program-studio";
import type { AppData, Lesson } from "../types";

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const read = (rel: string) => strip(readFileSync(path.resolve(import.meta.dirname, rel), "utf-8"));

function lesson(overrides: Partial<Lesson>): Lesson {
  return {
    id: "l1",
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    branchId: "b1",
    instrument: "Piyano",
    startAt: "2026-09-01T12:00:00.000Z",
    endAt: "2026-09-01T12:40:00.000Z",
    status: "scheduled",
    type: "regular",
    ...overrides,
  } as Lesson;
}

const NOW = new Date("2026-09-19T09:00:00.000Z");

describe("C — seçim statü rengini değiştirmez", () => {
  it("LessonOpsActions statüyü mount/seçimde YAYMAZ (useEffect yok), yalnız kullanıcı aksiyonunda yayar", () => {
    const code = read("../../components/lesson-ops-actions.tsx");
    expect(code).not.toMatch(/useEffect/);
    expect(code).toMatch(/function setLocalAndEmit/);
    // İstemci önceliği sunucuyla aynı: Telafi > İşlendi > Geldi
    expect(code).toMatch(/if \(local\.makeup\) return "makeup";\s*if \(local\.processed\) return "processed";\s*if \(local\.attended\) return "attended";/);
  });

  it("detay paneli ders id'siyle key'lenir; seçili ders güncel veriden türetilir (bayat kopya yok)", () => {
    const code = read("../../components/program-studio.tsx");
    expect(code).toMatch(/<DetailPanel\s+key=\{detailLesson\.id\}/);
    expect(code).toMatch(/useState<string \| null>\(null\);[\s\S]*detailLessonId/);
    expect(code).not.toMatch(/setDetailLesson\(lesson\)/);
  });

  it("geçmiş İşlendi dersi seçilince (override yok) kırmızı kalır; eski hatadaki null override onu yeşile çeviriyordu", () => {
    const processed = lesson({ status: "completed", lessonProcessed: true });
    expect(lessonCardStatusVisual(applyOpsOverride(processed, undefined), NOW)).toBe("processed");
    // Eski hata yolu (belgelemek için): başka dersten kalan null statü yayılırsa → "attended".
    expect(lessonCardStatusVisual(applyOpsOverride(processed, null), NOW)).toBe("attended");
  });

  it("işaretsiz geçmiş ders seçilince 'planlandı' kalır", () => {
    expect(lessonCardStatusVisual(applyOpsOverride(lesson({}), undefined), NOW)).toBe("planned");
  });
});

describe("D — seçim vurgusu statü dolgusundan ayrı kanal", () => {
  it("seçim sınıfı arka plan/metin rengi DEĞİŞTİRMEZ, çerçeve + gölge kullanır", () => {
    expect(LESSON_SELECTED_CLASS).toMatch(/outline/);
    expect(LESSON_SELECTED_CLASS).not.toMatch(/\bbg-/);
    expect(LESSON_SELECTED_CLASS).not.toMatch(/\btext-/);
  });

  it("hafta ve gün görünümünde yalnız tek ders seçili işaretlenir (detailLessonId === lesson.id)", () => {
    const code = read("../../components/program-studio.tsx");
    expect((code.match(/const selected = detailLessonId === lesson\.id;/g) ?? []).length).toBe(2);
  });
});

describe("E — ders detay paneli sadeleşti", () => {
  const code = read("../../components/program-studio.tsx");
  it("Akademik dönem metni, görev/evrak linkleri yok; başlık 'Yoklama durumu'", () => {
    expect(code).not.toMatch(/Akademik dönem/);
    expect(code).not.toMatch(/Bu ders için görev oluştur/);
    expect(code).not.toMatch(/Bu ders için evrak oluştur/);
    expect(code).not.toMatch(/Hızlı aksiyonlar/);
    expect(code).toMatch(/Yoklama durumu/);
  });

  it("iptal ve öğretmen/şube değiştir aynı satırda", () => {
    expect(code).toMatch(/Bu dersi iptal et"\}[\s\S]{0,200}<LessonReassignmentModal/);
  });
});

describe("F — iptal kuralı tek kaynak", () => {
  it("planlı normal ders (geçmiş/gelecek, Geldi işaretli olsa da) iptal edilebilir", () => {
    expect(canCancelLesson(lesson({}))).toBe(true);
    expect(canCancelLesson(lesson({ startAt: "2027-01-01T12:00:00.000Z" }))).toBe(true);
    expect(canCancelLesson(lesson({ studentAttended: true }))).toBe(true);
  });

  it("iptal edilemeyen her durumun açık Türkçe nedeni var", () => {
    expect(lessonCancelBlockReason(lesson({ status: "cancelled" }))).toMatch(/zaten iptal/);
    expect(lessonCancelBlockReason(lesson({ type: "makeup" }))).toMatch(/Telafi Merkezi/);
    expect(lessonCancelBlockReason(lesson({ status: "completed", lessonProcessed: true }))).toMatch(/İşlendi.*hakediş/);
    expect(lessonCancelBlockReason(lesson({ opsMakeupFlag: true }))).toMatch(/Telafi.*telafi hakkı/);
  });

  it("sunucu (applyLessonCancel) UI ile AYNI kararı ve AYNI metni döner", () => {
    const blocked = lesson({ opsMakeupFlag: true });
    const data = { lessons: [blocked], payments: [] } as unknown as AppData;
    const res = applyLessonCancel(data, blocked.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe(lessonCancelBlockReason(blocked));

    const okLesson = lesson({ id: "l2" });
    const ok = applyLessonCancel({ lessons: [okLesson], payments: [] } as unknown as AppData, "l2");
    expect(ok.ok).toBe(true);
  });

  it("UI kendi kuralını yazmaz; paylaşılan fonksiyonu kullanır", () => {
    const code = read("../../components/program-studio.tsx");
    expect(code).toMatch(/lessonCancelBlockReason\(lesson\)/);
    expect(code).not.toMatch(/function canCancel\(/);
  });

  it("seri iptali İşlendi/Telafi işaretli dersleri korur", () => {
    const base = { seriesId: "ser1" };
    const lessons = [
      lesson({ ...base, id: "a", startAt: "2026-10-01T12:00:00.000Z" }),
      lesson({ ...base, id: "b", startAt: "2026-10-08T12:00:00.000Z", opsMakeupFlag: true }),
      lesson({ ...base, id: "c", startAt: "2026-10-15T12:00:00.000Z" }),
    ];
    const data = { lessons, lessonSeries: [{ id: "ser1", status: "active" }] } as unknown as AppData;
    const res = cancelSeriesFromLesson(data, "a", NOW);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.cancelledLessonIds).toEqual(["a", "c"]);
  });
});
