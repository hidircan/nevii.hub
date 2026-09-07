import { describe, it, expect } from "vitest";
import {
  ATTENDANCE_CALENDAR_COLORS,
  attendanceCalendarTextColor,
  contrastRatio,
  lessonCardFillStyle,
  lessonCardMutedTextColor,
  resolveDayFillSegments,
  type AttendanceCalendarColorKey,
} from "../attendance-calendar";

/**
 * Yoklama Takvimi gün kutusu dolgusu — TEK renk kaynağı (ATTENDANCE_CALENDAR_COLORS)
 * ve segment çözümleme kuralı (resolveDayFillSegments) saf fonksiyon testleri.
 * UI (attendance-calendar-panel.tsx) bu iki fonksiyonu DOĞRUDAN kullanır —
 * ayrı bir hard-coded renk mantığı yoktur.
 */
describe("Yoklama Takvimi — gün kutusu dolgu rengi (tek kaynak)", () => {
  it("kapalı gün her zaman tek 'closed' segmenti döner — statü ne olursa olsun", () => {
    const segments = resolveDayFillSegments("closed", [{ lessonId: "l1", opsStatus: "attended" }]);
    expect(segments).toEqual(["closed"]);
  });

  it("dersi olmayan açık gün 'open' (nötr) döner", () => {
    expect(resolveDayFillSegments("open", [])).toEqual(["open"]);
  });

  it("tek ders, statü girilmemişse 'planned' (planlı, nötr mavi) döner", () => {
    expect(resolveDayFillSegments("open", [{ lessonId: "l1", opsStatus: null }])).toEqual(["planned"]);
  });

  it("tek ders Geldi ise ['attended'] döner", () => {
    expect(resolveDayFillSegments("open", [{ lessonId: "l1", opsStatus: "attended" }])).toEqual(["attended"]);
  });

  it("tek ders İşlendi ise ['processed'] döner", () => {
    expect(resolveDayFillSegments("open", [{ lessonId: "l1", opsStatus: "processed" }])).toEqual(["processed"]);
  });

  it("tek ders Telafi ise ['makeup'] döner", () => {
    expect(resolveDayFillSegments("open", [{ lessonId: "l1", opsStatus: "makeup" }])).toEqual(["makeup"]);
  });

  it("aynı günde birden fazla ders AYNI statüdeyse tek segmente indirgenir (bilgi kaybı yok — hepsi zaten aynı renk)", () => {
    const segments = resolveDayFillSegments("open", [
      { lessonId: "l1", opsStatus: "attended" },
      { lessonId: "l2", opsStatus: "attended" },
    ]);
    expect(segments).toEqual(["attended"]);
  });

  it("aynı günde birden fazla ders FARKLI statüdeyse, HER dersin kendi rengi kendi sırasında korunur — tek statüye indirgenmez", () => {
    const segments = resolveDayFillSegments("open", [
      { lessonId: "l1", opsStatus: "attended" },
      { lessonId: "l2", opsStatus: "processed" },
      { lessonId: "l3", opsStatus: null },
    ]);
    expect(segments).toEqual(["attended", "processed", "planned"]);
  });

  it("P0 (2026-09-05/07) — Geldi=yeşil, İşlendi=KIRMIZI, Telafi=SARI, İptal=koyu gri, Kapalı=siyah", () => {
    // Tonlar 2026-09-07'de AA için koyulaştırıldı (green-600→700, red-600→700);
    // statü→RENK AİLESİ eşlemesi (owner kararı) değişmedi.
    expect(ATTENDANCE_CALENDAR_COLORS.attended).toBe("#15803d");
    expect(ATTENDANCE_CALENDAR_COLORS.processed).toBe("#b91c1c");
    expect(ATTENDANCE_CALENDAR_COLORS.makeup).toBe("#ca8a04");
    expect(ATTENDANCE_CALENDAR_COLORS.cancelled).toBe("#475569");
    expect(ATTENDANCE_CALENDAR_COLORS.excused).toBe("#7c3aed");
    expect(ATTENDANCE_CALENDAR_COLORS.closed).toBe("#0a0a0a");
  });

  it("erişilebilir kontrast: sarı (Telafi) dolguda koyu metin, diğerlerinde açık metin", () => {
    expect(attendanceCalendarTextColor("makeup")).toBe("#1c1503");
    expect(attendanceCalendarTextColor("attended")).toBe("#ffffff");
    expect(attendanceCalendarTextColor("processed")).toBe("#ffffff");
    expect(attendanceCalendarTextColor("closed")).toBe("#ffffff");
  });

  /**
   * P0 UAT (2026-09-07) — kontrast artık SABİT bir kural değil, ölçüm.
   * Bu blok her dolgu/metin çiftini HESAPLAYARAK doğrular; ton değiştirilirse
   * (veya yeni bir statü eklenirse) burada kırılır.
   */
  describe("WCAG kontrastı — hesaplanarak doğrulanır", () => {
    it("bilinen referans değerler doğru hesaplanıyor", () => {
      expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
      expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    });

    it("HER dolgu, seçilen metin rengiyle AA'yı (4.5:1) geçer", () => {
      for (const key of Object.keys(ATTENDANCE_CALENDAR_COLORS) as AttendanceCalendarColorKey[]) {
        const fill = ATTENDANCE_CALENDAR_COLORS[key];
        const ratio = contrastRatio(fill, attendanceCalendarTextColor(key));
        expect(ratio, `${key} (${fill}) kontrastı ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("metin rengi, iki seçenekten kontrastı YÜKSEK olanıdır (sabit kural değil)", () => {
      // Regresyon koruması: eski "sarı ise koyu, aksi halde beyaz" kuralı
      // açık mavi (planned) ve açık gri (open) kutularda 1.8:1 / 1.3:1 bırakıyordu.
      expect(attendanceCalendarTextColor("planned")).toBe("#1c1503");
      expect(attendanceCalendarTextColor("open")).toBe("#1c1503");
    });
  });

  /**
   * Ders Programı (haftalık ızgara + gün listesi) kart dolgusu, Yoklama
   * Takvimi ile AYNI sözlükten beslenir — ikinci bir Tailwind renk haritası
   * YOKTUR (2026-09-07 öncesinde vardı: bg-emerald-700/bg-rose-700/bg-amber-400).
   */
  describe("Ders kartı tam arka plan dolgusu (Ders Programı)", () => {
    it("her statü canonical dolgusunu alır", () => {
      expect(lessonCardFillStyle("attended").backgroundColor).toBe(ATTENDANCE_CALENDAR_COLORS.attended);
      expect(lessonCardFillStyle("processed").backgroundColor).toBe(ATTENDANCE_CALENDAR_COLORS.processed);
      expect(lessonCardFillStyle("makeup").backgroundColor).toBe(ATTENDANCE_CALENDAR_COLORS.makeup);
      expect(lessonCardFillStyle("cancelled").backgroundColor).toBe(ATTENDANCE_CALENDAR_COLORS.cancelled);
    });

    it("kart dolgusu ile takvim gün kutusu dolgusu BİREBİR aynıdır (ekranlar arası tutarlılık)", () => {
      for (const status of ["attended", "processed", "makeup", "cancelled"] as const) {
        expect(lessonCardFillStyle(status).backgroundColor).toBe(ATTENDANCE_CALENDAR_COLORS[status]);
        expect(lessonCardFillStyle(status).color).toBe(attendanceCalendarTextColor(status));
      }
    });

    it("'Planlandı' ve bilinmeyen statü NÖTR tema yüzeyine düşer (güvenli fallback)", () => {
      expect(lessonCardFillStyle("planned")).toEqual({
        backgroundColor: "var(--color-surface)",
        color: "var(--color-text)",
      });
      expect(lessonCardFillStyle("gelecekte-eklenecek-statu")).toEqual({
        backgroundColor: "var(--color-surface)",
        color: "var(--color-text)",
      });
      expect(lessonCardMutedTextColor("planned")).toBe("var(--color-text-muted)");
    });

    it("dolgulu kartta ikincil metin de dolgu üstü kontrast rengini kullanır", () => {
      expect(lessonCardMutedTextColor("makeup")).toBe("#1c1503");
      expect(lessonCardMutedTextColor("processed")).toBe("#ffffff");
    });
  });
});
