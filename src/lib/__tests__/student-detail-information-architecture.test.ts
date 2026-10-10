/**
 * J — Öğrenci detayı bilgi mimarisi.
 *
 * ÖNCE: tek `page.tsx` (858 satır), 13 bölüm alt alta, `#anchor` linkleri.
 * Bir başlığa tıklamak ekran açmıyor, sayfayı kaydırıyordu; her açılışta
 * ödevden karşılıklı değerlendirmeye kadar HER ŞEY yükleniyordu.
 *
 * SONRA: her ana başlık GERÇEK bir route. Bu test yapının kurulduğunu ve
 * eski çapa-linklerin geride kalmadığını doğrular.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const BASE = path.join(ROOT, "src/app/panel/ogrenciler/[studentId]");

const TABS = ["bilgiler", "program", "odemeler", "sozlesmeler", "gelisim", "evraklar"];

describe("her ana başlık kendi route'u", () => {
  it("özet + altı sekme sayfası mevcut", () => {
    expect(existsSync(path.join(BASE, "page.tsx"))).toBe(true);
    for (const tab of TABS) {
      expect(existsSync(path.join(BASE, tab, "page.tsx"))).toBe(true);
    }
  });

  it("paylaşılan kimlik başlığı + sekme navigasyonu layout'ta (her sayfada tekrarlanmıyor)", () => {
    const layout = readFileSync(path.join(BASE, "layout.tsx"), "utf-8");
    expect(layout).toContain("StudentDetailTabs");
    expect(layout).toContain("PageHeader");
    expect(layout).toContain("StudentArchiveToggle");
  });

  it("sekme bileşeni layout'taki tüm route'ları listeler", () => {
    const tabs = readFileSync(path.join(ROOT, "src/components/student-detail-tabs.tsx"), "utf-8");
    for (const tab of TABS) {
      expect(tabs).toContain(`segment: "${tab}"`);
    }
    expect(tabs).toContain('segment: ""'); // Özet
  });

  it("Sözleşme Merkezi artık kendi başlığını/back butonunu TEKRARLAMAZ", () => {
    const page = readFileSync(path.join(BASE, "sozlesmeler/page.tsx"), "utf-8");
    expect(page).not.toContain("BackButton");
    expect(page).not.toContain("KurumScopeNote");
  });
});

describe("eski çapa (#anchor) gezinmesi tamamen kaldırıldı", () => {
  it("öğrenci detay route'larında `href=\"#...\"` kalmadı", () => {
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

  it("Sözleşme Merkezi'nden kayıt düzenlemeye dönüş GERÇEK route'a gider", () => {
    const page = readFileSync(path.join(BASE, "sozlesmeler/page.tsx"), "utf-8");
    expect(page).toContain("/bilgiler?duzenle=kayit");
    expect(page).not.toContain("#genel");
  });
});

describe("performans — sekmeye bölmek okuma sayısını ARTIRMAZ", () => {
  it("ortak bağlam istek başına TEK okumaya memoize edilmiş", () => {
    const ctx = readFileSync(path.join(BASE, "_context.ts"), "utf-8");
    expect(ctx).toContain('import { cache } from "react"');
    expect(ctx).toContain("export const loadStudentPageContext = cache(");
  });

  it("ağır servis çağrıları yalnız ilgili sekmede yapılır", () => {
    const overview = readFileSync(path.join(BASE, "page.tsx"), "utf-8");
    // Özet, ödev/materyal/müfredat/karşılıklı değerlendirme YÜKLEMEZ.
    expect(overview).not.toContain("listHomeworkForStudentTool");
    expect(overview).not.toContain("listTeacherFeedbackTool");
    expect(overview).not.toContain("listStudentDocumentsTool");

    const progress = readFileSync(path.join(BASE, "gelisim/page.tsx"), "utf-8");
    expect(progress).toContain("listHomeworkForStudentTool");
    expect(progress).toContain("listTeacherFeedbackTool");
  });
});
