/**
 * Yoklama statü renkleri — paylaşılan sözleşme testi.
 *
 * Amaç: yönetici ders programı ile öğretmen ders programı AYNI eşlemeyi
 * (features/attendance/status-style.ts) kullanır; öğretmen yalnız SALT
 * OKUNUR rozet görür, yoklama değiştiremez. Renkler açık/koyu temada
 * WCAG AA (≥ 4.5:1) kontrast sağlar ve renk tek başına anlam taşımaz
 * (her statüde ikon + etiket).
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

describe("yoklama statüsü eşlemesi", () => {
  it("öncelik: iptal > işlendi/katıldı > gelmedi > izinli > işaretlenmedi", () => {
    expect(attendanceStatusForLesson({ status: "cancelled" })).toBe("cancelled");
    expect(attendanceStatusForLesson({ status: "scheduled", lessonProcessed: true })).toBe("attended");
    expect(attendanceStatusForLesson({ status: "scheduled", studentAttended: true })).toBe("attended");
    expect(attendanceStatusForLesson({ status: "no_show" })).toBe("absent");
    expect(attendanceStatusForLesson({ status: "scheduled", studentAbsent: true })).toBe("absent");
    expect(attendanceStatusForLesson({ status: "scheduled", studentExcused: true })).toBe("excused");
    expect(attendanceStatusForLesson({ status: "scheduled" })).toBe("unmarked");
    expect(attendanceStatusForLesson({ status: "in_progress" })).toBe("unmarked");
  });

  it("her statüde ikon + etiket var (renk tek başına anlam taşımaz)", () => {
    for (const code of Object.keys(ATTENDANCE_STATUS_STYLES) as Array<keyof typeof ATTENDANCE_STATUS_STYLES>) {
      const style = attendanceStatusStyle(code);
      expect(style.icon, code).toBeTruthy();
      expect(style.labelKey, code).toMatch(/^attStatus\./);
      expect(style.tone, code).toBeTruthy();
    }
  });

  it("legend dört statüyü kapsar (iptal edilen ders yoklama statüsü değildir)", () => {
    expect(ATTENDANCE_LEGEND_CODES).toEqual(["attended", "absent", "excused", "unmarked"]);
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
    expect(detail).not.toMatch(/label="Katıldı"|label="Gelmedi"|label="İzinli"/);
  });
});
