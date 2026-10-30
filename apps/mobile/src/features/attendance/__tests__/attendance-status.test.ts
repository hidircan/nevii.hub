/**
 * Yoklama statüsü — paylaşılan sözleşme testi (İş 2, 2026-10-30).
 *
 * Tek kaynak `features/attendance/status-style.ts`; web yönetici panelinin
 * `resolveLessonFinalStatus` + `LessonStatusBadge` + Yoklama Raporu
 * `STATUS_LABEL` paritesidir: 6 görünür statü, "Mazeretli" YOK.
 * Yönetici/öğretmen AYNI eşlemeyi kullanır; öğretmen SALT OKUNUR rozet
 * görür. Renkler açık/koyu temada WCAG AA (≥ 4.5:1) kontrast sağlar ve
 * renk tek başına anlam taşımaz (her statüde ikon + etiket).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ATTENDANCE_LEGEND_CODES,
  ATTENDANCE_STATUS_STYLES,
  attendanceStatusForLesson,
  attendanceStatusStyle,
} from "../status-style";
import { BADGE_TONE_COLORS } from "../../../theme/badge-tones";
import { lightTheme, darkTheme } from "../../../theme/tokens";

const APP_DIR = path.join(__dirname, "..", "..", "..", "..", "app");

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("attendanceStatusForLesson — web resolveLessonFinalStatus port'u", () => {
  const PAST = { startAt: "2020-01-01T09:00:00.000Z" };
  const FUTURE = { startAt: "2099-01-01T09:00:00.000Z" };
  /** Legacy bayraklar (`studentAbsent`/`studentExcused`) resolver'in TİPİNE
   *  ARTIK girmiyor — yukarı akış alanları olarak iletilebilir; Tip düzeyi
   *  sözleşme bunu kasıtlı olduğumuzu kilitler (web resolver da okumaz). */
  type ResolverInput = Parameters<typeof attendanceStatusForLesson>[0];
  const legacy = (fields: Record<string, unknown>): ResolverInput => fields as ResolverInput;

  it("web öncelik zinciri: iptal > telafi > işlendi > geldi > planlanan telafi > zaman", () => {
    expect(attendanceStatusForLesson({ status: "cancelled", ...PAST })).toBe("cancelled");
    expect(attendanceStatusForLesson({ status: "scheduled", opsMakeupFlag: true, lessonProcessed: true, ...PAST })).toBe("makeup");
    expect(attendanceStatusForLesson({ status: "scheduled", lessonProcessed: true, studentAttended: true, ...PAST })).toBe("processed");
    expect(attendanceStatusForLesson({ status: "scheduled", studentAttended: true, ...PAST })).toBe("attended");
    expect(attendanceStatusForLesson({ status: "scheduled", type: "makeup", ...PAST })).toBe("makeup_planned");
    expect(attendanceStatusForLesson({ status: "scheduled", ...FUTURE })).toBe("planned");
    expect(attendanceStatusForLesson({ status: "completed", ...PAST })).toBe("attended");
    expect(attendanceStatusForLesson({ status: "completed", ...FUTURE })).toBe("planned");
  });

  it("İşlendi (processed) Geldi (attended) DEĞİLDİR — ayrı statüler", () => {
    expect(attendanceStatusForLesson({ status: "scheduled", lessonProcessed: true, ...PAST })).not.toBe(
      attendanceStatusForLesson({ status: "scheduled", studentAttended: true, ...PAST })
    );
  });

  it("legacy bayraklar görünür statü üretmez (Mazeretli YOK — 2026-10-30 owner)", () => {
    // Web resolver bu bayrakları OKUMAZ; bayraklı geçmiş işaresiz ders
    // "planned", `completed` ise "attended" olur.
    expect(attendanceStatusForLesson(legacy({ status: "scheduled", studentExcused: true, ...PAST }))).toBe("planned");
    expect(attendanceStatusForLesson(legacy({ status: "scheduled", studentAbsent: true, ...PAST }))).toBe("planned");
    expect(attendanceStatusForLesson({ status: "no_show", ...PAST })).toBe("planned");
    expect(attendanceStatusForLesson(legacy({ status: "completed", studentExcused: true, ...PAST }))).toBe("attended");
  });

  it("bilinmeyen/eksik veri asla Geldi yorumlanmaz — nötr planned", () => {
    expect(attendanceStatusForLesson(legacy({ status: "scheduled" }), new Date("2026-10-30T12:00:00Z"))).toBe("planned");
    expect(attendanceStatusForLesson(legacy({ ...PAST }))).toBe("planned"); // status tanımsız → bayrak yok
  });

  it("statü sözlüğü: web 6 + legacy ledger-absent; 'excused' YOK", () => {
    const codes = Object.keys(ATTENDANCE_STATUS_STYLES);
    expect(codes).toEqual(
      expect.arrayContaining(["attended", "processed", "makeup", "makeup_planned", "cancelled", "planned", "absent"])
    );
    expect(codes).not.toContain("excused"); // Mazeretli yok
  });
});

describe("statü stili — web renk/ikon sözleşmesi", () => {
  it("web PRESENTATION tonları: İşlendi KIRMIZI, Geldi yeşil, Telafi sarı", () => {
    expect(attendanceStatusStyle("attended")).toMatchObject({ tone: "success", labelKey: "attStatus.present" });
    expect(attendanceStatusStyle("processed")).toMatchObject({ tone: "danger", labelKey: "attStatus.processed" });
    expect(attendanceStatusStyle("makeup")).toMatchObject({ tone: "warning", labelKey: "attStatus.makeup" });
    expect(attendanceStatusStyle("makeup_planned")).toMatchObject({ tone: "warning", labelKey: "attStatus.makeupPlanned" });
    expect(attendanceStatusStyle("cancelled")).toMatchObject({ tone: "neutral", labelKey: "attStatus.cancelled" });
    expect(attendanceStatusStyle("planned")).toMatchObject({ tone: "neutral", labelKey: "attStatus.planned" });
    // Ledger'in legacy 'Gelmedi' gösterimi nötrdür.
    expect(attendanceStatusStyle("absent")).toMatchObject({ tone: "neutral", labelKey: "attStatus.absent" });
  });

  it("her statüde ikon + etiket var (renk tek başına anlam taşımaz)", () => {
    for (const code of Object.keys(ATTENDANCE_STATUS_STYLES) as Array<keyof typeof ATTENDANCE_STATUS_STYLES>) {
      const style = attendanceStatusStyle(code);
      expect(style.icon, code).toBeTruthy();
      expect(style.labelKey, code).toMatch(/^attStatus\./);
      expect(style.tone, code).toBeTruthy();
    }
  });

  it("legend web takviminin kapsamıdır: Geldi / İşlendi / Telafi / Planlanan telafi / Planlandı", () => {
    expect(ATTENDANCE_LEGEND_CODES).toEqual([
      "attended",
      "processed",
      "makeup",
      "makeup_planned",
      "planned",
    ]);
    expect(ATTENDANCE_LEGEND_CODES).not.toContain("cancelled");
    expect(ATTENDANCE_LEGEND_CODES).not.toContain("absent");
    expect(ATTENDANCE_LEGEND_CODES).not.toContain("excused");
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ])("%s temada rozet metni/zemin kontrastı ≥ 4.5:1 (WCAG AA)", (name, theme) => {
    for (const code of ATTENDANCE_LEGEND_CODES) {
      const tone = attendanceStatusStyle(code).tone;
      const keys = BADGE_TONE_COLORS[tone];
      const fg = theme.colors[keys.fg];
      const bg = theme.colors[keys.bg];
      const ratio = contrast(fg, bg);
      expect(ratio, `${name}/${code} (${fg} on ${bg})`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("paylaşımlı kullanım — admin ve öğretmen aynı modül", () => {
  it("ders kartı paylaşılan rozeti kullanır", async () => {
    const card = await fs.readFile(
      path.join(__dirname, "..", "..", "..", "components", "ui", "lesson-card.tsx"),
      "utf-8"
    );
    expect(card).toContain("AttendanceStatusBadge");
    expect(card).toMatch(/showAttendance/);
    const badge = await fs.readFile(
      path.join(__dirname, "..", "..", "..", "components", "ui", "attendance-status-badge.tsx"),
      "utf-8"
    );
    expect(badge).toContain("features/attendance/status-style");
    expect(badge).toMatch(/numberOfLines=\{1\}/);
  });

  it("admin programı ve öğretmen programı aynı bayrağı kullanır", async () => {
    const admin = await fs.readFile(path.join(APP_DIR, "(admin)", "program", "index.tsx"), "utf-8");
    const teacher = await fs.readFile(path.join(APP_DIR, "(teacher)", "bugun", "index.tsx"), "utf-8");
    expect(admin).toMatch(/showAttendance/);
    expect(teacher).toMatch(/showAttendance/);
    // Öğretmen programında legend var.
    expect(teacher).toMatch(/AttendanceLegend/);
  });

  it("öğretmen ders detayında rozet SALT OKUNUR gösterilir", async () => {
    const detail = await fs.readFile(path.join(APP_DIR, "(teacher)", "bugun", "[lessonId].tsx"), "utf-8");
    expect(detail).toMatch(/AttendanceStatusBadge/);
    expect(detail).not.toMatch(/lessons\/.*\/ops/);
    expect(detail).not.toMatch(/label="Katıldı"|label="Gelmedi"|label="İzinli"|label="Mazeretli"/);
  });
});
