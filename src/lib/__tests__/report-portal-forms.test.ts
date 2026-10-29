import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";

/** Rapor portalı Task 3 — tek ortak mobil form; öğretmen portalı da aynı bileşeni kullanır. */
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("ortak gelişim formları", () => {
  it.each(["src/app/ogretmen/ogrenciler/[studentId]/page.tsx", "src/app/ogretmen/degerlendirme/[studentId]/page.tsx"])(
    "%s yeni ders gelişim formunu kullanır",
    (rel) => {
      const src = read(rel);
      expect(src).toContain("LessonAssessmentMobileForm");
      expect(src).not.toContain("lesson-assessment-form\"");
    }
  );

  it("eski form kaldırıldı, 4 haftalık liste tek form sayfasına (/gelisim) yönlendirir", () => {
    expect(existsSync(path.join(process.cwd(), "src/components/lesson-assessment-form.tsx"))).toBe(false);
    expect(read("src/components/periodic-assessment-pending-list.tsx")).toContain("/gelisim/${item.studentId}?sekme=donemsel");
  });

  it("4 haftalık formda onay kutusu / serbest imza yok; tek zorunlu alan", () => {
    const src = read("src/components/reports/periodic-assessment-mobile-form.tsx");
    expect(src).not.toMatch(/approved|teacherSignedName/);
    expect(src.match(/\brequired\b/g)).toHaveLength(1);
  });

  it("rapor başlığı kurum TAM adını tek yardımcıdan okur (kısa ad kişi adı gibi görünüyordu)", () => {
    for (const rel of ["src/app/gelisim/page.tsx", "src/app/gelisim/[studentId]/page.tsx", "src/app/degerlendirme/[assessmentId]/page.tsx", "src/app/degerlendirme/rapor/[studentId]/page.tsx"]) {
      const src = read(rel);
      expect(src).toContain("reportInstitutionName(");
      expect(src).not.toContain("settings.shortName");
    }
  });

  it("mobil dokunma alanı ≥ 44 px ve 16 px yazı (iOS yakınlaştırması yok)", () => {
    const parts = read("src/components/reports/form-parts.tsx");
    expect(parts).toMatch(/min-h-11/);
    expect(parts).toMatch(/text-base/);
    expect(parts).toMatch(/safe-area-inset-bottom/);
  });

  it("formlar taslağı cihazda tutar ve gönderimde temizler", () => {
    for (const rel of ["src/components/reports/lesson-assessment-mobile-form.tsx", "src/components/reports/periodic-assessment-mobile-form.tsx"]) {
      const src = read(rel);
      expect(src).toContain("useFormDraft");
      expect(src).toContain("draftOwner");
      expect(src).toMatch(/clear\(\);\s*\n\s*setDone\(true\)/);
    }
  });
});

describe("taslak gizliliği (commit güvenlik incelemesi)", () => {
  it("taslak sekmeyle biten depolamada, süreli; veliye özel not saklanmaz", () => {
    const hook = read("src/components/reports/use-form-draft.ts");
    expect(hook).toContain("sessionStorage");
    expect(hook).not.toMatch(/window\.localStorage/);
    expect(hook).toMatch(/DRAFT_TTL_MS/);
    expect(read("src/components/reports/lesson-assessment-mobile-form.tsx")).toMatch(/exclude: \["parentPrivateNote"\]/);
  });
});
