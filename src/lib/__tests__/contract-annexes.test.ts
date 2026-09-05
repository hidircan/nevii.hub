import { describe, it, expect } from "vitest";
import {
  buildContractAnnexes,
  composeContractOutputHtml,
  diagnoseContractAnnexTemplates,
  formatConsentScopesText,
} from "../contract-annexes";

/**
 * P0 (2026-09-05) — TEK BİRLEŞİK SÖZLEŞME ÇIKTISI: ana sözleşme → KVKK →
 * fotoğraf/video, HEP bu sırada, metin kaybı/çoğaltması olmadan.
 *
 * Şablon gövdeleri BİLEREK 400 karakterin üzerinde: `resolveAnnexBody` bunun
 * altındaki gövdeleri eski "stub" kabul edip kurumsal kaynak metnine düşer
 * (bkz. aşağıdaki "kurumsal kaynak" testleri).
 */
const filler = "Bu bölüm kurumun kendi hukuki metnidir. ".repeat(12);
const templates = [
  {
    id: "t-kvkk",
    kind: "kvkk",
    active: true,
    updatedAt: "2026-09-01T00:00:00.000Z",
    bodyHtml: `<h2>KVKK METNİ</h2><p>{{institutionName}} · {{studentName}} · {{date}} · {{reference}}</p><p>${filler}</p>`,
  },
  {
    id: "t-foto",
    kind: "parent_social_media_consent",
    active: true,
    updatedAt: "2026-09-01T00:00:00.000Z",
    bodyHtml: `<h2>FOTO/VIDEO RIZA</h2><p>{{parentName}} · {{scopes}} · {{consentGrantedMark}}/{{consentDeniedMark}}</p><p>${filler}</p>`,
  },
  {
    id: "t-kvkk-eski",
    kind: "kvkk",
    active: false,
    updatedAt: "2026-09-04T00:00:00.000Z",
    bodyHtml: `<p>PASİF TASLAK — ASLA KULLANILMAMALI</p><p>${filler}</p>`,
  },
];

const baseInput = {
  templates,
  contractNumber: "SZL-2026-0001",
  institutionName: "Nilüfer Acar Müzik",
  institutionAddress: "Bursa",
  studentName: "Ayşe Yılmaz",
  parentName: "Mehmet Yılmaz",
  dateText: "05.09.2026",
  photoVideoConsent: { granted: true, scopes: ["website", "instagram"] },
};

describe("Sözleşme ekleri — deterministik üretim", () => {
  it("ekleri SABİT sırada üretir: önce KVKK, hemen ardından fotoğraf/video", () => {
    const annexes = buildContractAnnexes(baseInput);
    expect(annexes.map((a) => a.kind)).toEqual(["kvkk", "parent_social_media_consent"]);
  });

  it("her ek kendi referans numarasını taşır (sözleşme numarasından türetilir)", () => {
    const annexes = buildContractAnnexes(baseInput);
    expect(annexes[0].reference).toBe("SZL-2026-0001-EK1");
    expect(annexes[1].reference).toBe("SZL-2026-0001-EK2");
  });

  it("yalnızca AKTİF şablonu kullanır — pasif taslak metni çıktıya SIZMAZ", () => {
    const annexes = buildContractAnnexes(baseInput);
    expect(annexes[0].html).toContain("KVKK METNİ");
    expect(annexes[0].html).not.toContain("PASİF TASLAK");
  });

  it("rıza kararı ve kapsamı fotoğraf/video ekine doğru işlenir", () => {
    const granted = buildContractAnnexes(baseInput)[1].html;
    expect(granted).toContain("Kurumun resmi internet sitesi");
    expect(granted).toContain("☑/☐");

    const denied = buildContractAnnexes({
      ...baseInput,
      photoVideoConsent: { granted: false, scopes: [] },
    })[1].html;
    expect(denied).toContain("☐/☑");
    expect(denied).toContain("—");
  });

  /**
   * P0 revizyonu (2026-09-05) — kurumun aktif şablonu YOKSA ya da eski bir
   * tek-satırlık stub ise, ek bölüm ARTIK atlanmaz/zayıf kalmaz: kurumsal
   * kaynak metni kullanılır. Normal yeni-öğrenci akışında AYRI bir "taslak
   * oluştur → etkinleştir" adımı GEREKMEZ.
   */
  it("aktif şablonu OLMAYAN tür kurumsal kaynak metnine düşer — bölüm eksik kalmaz", () => {
    const annexes = buildContractAnnexes({ ...baseInput, templates: [templates[0]] });
    expect(annexes.map((a) => a.kind)).toEqual(["kvkk", "parent_social_media_consent"]);
    expect(annexes[1].html).toContain("FOTOĞRAF / VİDEO AÇIK RIZA FORMU");
    expect(annexes[1].html.length).toBeGreaterThan(400);
  });

  it("eski tek-satırlık stub şablon YERİNE kurumsal kaynak metni kullanılır", () => {
    const annexes = buildContractAnnexes({
      ...baseInput,
      templates: [
        { ...templates[0], bodyHtml: "<p>KVKK</p>" },
        { ...templates[1], bodyHtml: "<p>Fotoğraf/Video</p>" },
      ],
    });
    expect(annexes[0].html).toContain("KVKK AYDINLATMA METNİ");
    expect(annexes[0].html).toContain("6698");
    expect(annexes[1].html).toContain("FOTOĞRAF / VİDEO AÇIK RIZA FORMU");
  });

  it("kurumun DOLGUN kendi şablonu varsa kurumsal kaynak metni EZMEZ", () => {
    const annexes = buildContractAnnexes(baseInput);
    expect(annexes[0].html).toContain("KVKK METNİ");
    expect(annexes[0].html).not.toContain("6698 sayılı");
  });

  it("kapsam listesi boşsa '—' döner", () => {
    expect(formatConsentScopesText([])).toBe("—");
    expect(formatConsentScopesText(undefined)).toBe("—");
  });
});

describe("composeContractOutputHtml — tek çıktı, doğru sıra", () => {
  it("ana sözleşme İLK, ekler ardından; her ek kendi sayfasında başlar", () => {
    const html = composeContractOutputHtml("<p>ANA SÖZLEŞME</p>", buildContractAnnexes(baseInput));
    const mainAt = html.indexOf("ANA SÖZLEŞME");
    const kvkkAt = html.indexOf("KVKK METNİ");
    const fotoAt = html.indexOf("FOTO/VIDEO RIZA");
    expect(mainAt).toBeGreaterThanOrEqual(0);
    expect(kvkkAt).toBeGreaterThan(mainAt);
    expect(fotoAt).toBeGreaterThan(kvkkAt);
    expect(html.match(/page-break-before:always/g)).toHaveLength(2);
  });

  it("hukuki metin ÇOĞALTILMAZ — her bölüm çıktıda tam olarak bir kez geçer", () => {
    const html = composeContractOutputHtml("<p>ANA SÖZLEŞME</p>", buildContractAnnexes(baseInput));
    expect(html.match(/ANA SÖZLEŞME/g)).toHaveLength(1);
    expect(html.match(/KVKK METNİ/g)).toHaveLength(1);
    expect(html.match(/FOTO\/VIDEO RIZA/g)).toHaveLength(1);
  });

  it("her ek kendi başlığı ve referansıyla AYRI bölüm olarak işaretlenir", () => {
    const html = composeContractOutputHtml("<p>ANA</p>", buildContractAnnexes(baseInput));
    expect(html).toContain("KVKK Aydınlatma Metni / Kişisel Verilerin Korunması · Referans: SZL-2026-0001-EK1");
    expect(html).toContain("Fotoğraf / Video Açık Rıza Formu · Referans: SZL-2026-0001-EK2");
  });

  it("ek yoksa ana sözleşme HTML'i AYNEN döner (mevcut davranış değişmez)", () => {
    expect(composeContractOutputHtml("<p>ANA</p>", [])).toBe("<p>ANA</p>");
  });
});

describe("diagnoseContractAnnexTemplates — eksik/stub ek şablon tespiti", () => {
  it("dolgun aktif şablonu 'ok' işaretler", () => {
    const long = { ...templates[0], bodyHtml: "<p>" + "a".repeat(500) + "</p>" };
    const diag = diagnoseContractAnnexTemplates([long, { ...templates[1], bodyHtml: "<p>" + "b".repeat(500) + "</p>" }]);
    expect(diag.map((d) => d.status)).toEqual(["ok", "ok"]);
  });

  it("aktif şablonu OLMAYAN türü 'missing' işaretler", () => {
    expect(diagnoseContractAnnexTemplates([]).map((d) => d.status)).toEqual(["missing", "missing"]);
  });

  it("tek satırlık eski stub şablonu 'stub' işaretler — sessizce kabul etmez", () => {
    const diag = diagnoseContractAnnexTemplates([
      { ...templates[0], bodyHtml: "<p>KVKK</p>" },
      { ...templates[1], bodyHtml: "<p>Fotoğraf/Video</p>" },
    ]);
    expect(diag.map((d) => d.status)).toEqual(["stub", "stub"]);
  });
});
