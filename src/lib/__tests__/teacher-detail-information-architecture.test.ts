/**
 * Öğretmen detayı bilgi mimarisi.
 *
 * ÖNCE: tek `page.tsx` (~665 satır), 14 bölüm alt alta, `#anchor` chip'leri.
 * Bir başlığa tıklamak ekran açmıyor, sayfayı kaydırıyordu; performans paneli
 * özetle tekrarlanıyordu.
 *
 * SONRA: her ana başlık GERÇEK bir route. Bu test yapının kurulduğunu ve
 * eski çapa-linklerin geride kalmadığını doğrular.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const BASE = path.join(ROOT, "src/app/panel/ogretmenler/[teacherId]");

const TABS = [
  "bilgiler",
  "program",
  "musaitlik",
  "ogrenciler",
  "performans",
  "hakedis",
  "odemeler",
  "geri-bildirim",
];

describe("her ana başlık kendi route'u", () => {
  it("özet + sekme sayfaları mevcut", () => {
    expect(existsSync(path.join(BASE, "page.tsx"))).toBe(true);
    for (const tab of TABS) {
      expect(existsSync(path.join(BASE, tab, "page.tsx"))).toBe(true);
    }
  });

  it("paylaşılan kimlik başlığı + sekme navigasyonu layout'ta (her sayfada tekrarlanmıyor)", () => {
    const layout = readFileSync(path.join(BASE, "layout.tsx"), "utf-8");
    expect(layout).toContain("TeacherDetailTabs");
    expect(layout).toContain("PageHeader");
    expect(layout).toContain("TeacherArchiveAction");
  });

  it("sekme bileşeni layout'taki tüm route'ları listeler", () => {
    const tabs = readFileSync(path.join(ROOT, "src/components/teacher-detail-tabs.tsx"), "utf-8");
    for (const tab of TABS) {
      expect(tabs).toContain(`segment: "${tab}"`);
    }
    expect(tabs).toContain('segment: ""'); // Özet
  });

  it("mevcut alt route'lar BackButton / KurumScopeNote tekrarlamaz", () => {
    for (const tab of ["musaitlik", "performans", "hakedis", "odemeler", "geri-bildirim"]) {
      const page = readFileSync(path.join(BASE, tab, "page.tsx"), "utf-8");
      expect(page).not.toContain("BackButton");
      expect(page).not.toContain("KurumScopeNote");
    }
  });
});

describe("eski çapa (#anchor) gezinmesi tamamen kaldırıldı", () => {
  it("öğretmen detay route'larında `href=\"#...\"` kalmadı", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".tsx")) continue;
        const code = readFileSync(full, "utf-8");
        if (/href=["'`]#/.test(code)) offenders.push(path.relative(ROOT, full));
      }
    };
    walk(BASE);
    expect(offenders).toEqual([]);
  });

  it("performans dashboard program linki gerçek route'a gider", () => {
    const dash = readFileSync(
      path.join(ROOT, "src/components/teacher-performance-v2-dashboard.tsx"),
      "utf-8"
    );
    expect(dash).toContain(`/panel/ogretmenler/\${teacherId}/program`);
    expect(dash).not.toContain("#program");
  });
});

describe("performans — sekmeye bölmek okuma sayısını ARTIRMAZ", () => {
  it("ortak bağlam istek başına TEK okumaya memoize edilmiş", () => {
    const ctx = readFileSync(path.join(BASE, "_context.ts"), "utf-8");
    expect(ctx).toContain('import { cache } from "react"');
    expect(ctx).toContain("export const loadTeacherPageContext = cache(");
  });

  it("özet ağır performans/geri-bildirim yüklemez; ilgili sekmeler yükler", () => {
    const overview = readFileSync(path.join(BASE, "page.tsx"), "utf-8");
    expect(overview).not.toContain("TeacherPerformancePanel");
    expect(overview).not.toContain("getTeacherPerformanceReportV2Tool");
    expect(overview).not.toContain("listTeacherFeedbackForReviewTool");
    expect(overview).not.toContain("listStudentDocumentsTool");
    expect(overview).not.toContain("FeeRuleManager");

    const performans = readFileSync(path.join(BASE, "performans/page.tsx"), "utf-8");
    expect(performans).toContain("getTeacherPerformanceReportV2Tool");

    const feedback = readFileSync(path.join(BASE, "geri-bildirim/page.tsx"), "utf-8");
    expect(feedback).toContain("listTeacherFeedbackForReviewTool");

    const hakedis = readFileSync(path.join(BASE, "hakedis/page.tsx"), "utf-8");
    expect(hakedis).toContain("FeeRuleManager");
  });
});
