/**
 * 10. tur iş #10 — sözleşme sonrası "Ödeme Planını Gör" → ödemeler →
 * "Sözleşmeye dön" akışı. Başarı adımı `?olusturuldu=<id>` ile geri
 * kurulur (sunucu listesinden, hassas veri URL'ye konmaz); öğretmen/oda
 * tercihi sekme-içi saklanır; dönüş güvenli returnTo ile yapılır.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  resolveSafeReturnTo,
  returnToLabel,
  withQueryParam,
  withoutQueryParam,
  withReturnTo,
} from "../safe-return-to";

const root = (...p: string[]) => join(process.cwd(), ...p);
const read = (rel: string) => readFileSync(root(rel), "utf-8");

describe("güvenli dönüş yardımcıları", () => {
  it("withQueryParam mevcut parametreleri koruyup anahtarı ekler/değiştirir", () => {
    expect(withQueryParam("/panel/ogrenciler/s1/sozlesmeler", "olusturuldu", "c1")).toBe(
      "/panel/ogrenciler/s1/sozlesmeler?olusturuldu=c1"
    );
    expect(withQueryParam("/panel/x?yeni=1", "olusturuldu", "c1")).toBe("/panel/x?yeni=1&olusturuldu=c1");
    expect(withQueryParam("/panel/x?olusturuldu=eski&a=1", "olusturuldu", "c1")).toBe("/panel/x?olusturuldu=c1&a=1");
  });

  it("withoutQueryParam yalnız hedef anahtarı kaldırır", () => {
    expect(withoutQueryParam("/panel/x?olusturuldu=c1&yeni=1", "olusturuldu")).toBe("/panel/x?yeni=1");
    expect(withoutQueryParam("/panel/x?olusturuldu=c1", "olusturuldu")).toBe("/panel/x");
    expect(withoutQueryParam("/panel/x", "olusturuldu")).toBe("/panel/x");
  });

  it("mutlak/protokol-göreli URL'ler aynen iade edilir (yönlendirme yüzeyi açılmaz)", () => {
    expect(withQueryParam("https://evil.com/x", "olusturuldu", "c1")).toBe("https://evil.com/x");
    expect(withQueryParam("//evil.com/x", "olusturuldu", "c1")).toBe("//evil.com/x");
    expect(withoutQueryParam("https://evil.com/x?a=1", "a")).toBe("https://evil.com/x?a=1");
  });

  it("?olusturuldu= taşıyan sözleşme yolu güvenli returnTo'dan geçer, etiketi doğrudur", () => {
    const path = "/panel/ogrenciler/s1/sozlesmeler?olusturuldu=c1";
    expect(resolveSafeReturnTo(encodeURIComponent(path))).toBe(path);
    expect(returnToLabel(path)).toBe("Öğrencinin sözleşmelerine dön");
    const link = withReturnTo("/panel/odemeler/s1", path);
    expect(link.startsWith("/panel/odemeler/s1?returnTo=")).toBe(true);
    // Dış hedef hâlâ engelli.
    expect(withReturnTo("/panel/odemeler/s1", "https://evil.com")).toBe("/panel/odemeler/s1");
  });
});

describe("akış bağlantıları (statik)", () => {
  it("başarı panelindeki 'Ödeme Planını Gör' returnTo taşır (yalnız sözleşme kimliği)", () => {
    const panel = read("src/components/contract-panel.tsx");
    expect(panel).toMatch(/withReturnTo\(\s*`\/panel\/odemeler\/\$\{studentId\}`/);
    expect(panel).toMatch(/withQueryParam\(currentPath, "olusturuldu", contract\.id\)/);
    // Tutar/tarih gibi hassas veri URL'ye konmaz — yalnız kimlik.
    expect(panel).not.toMatch(/withQueryParam\(currentPath, "tutar"/);
    expect(panel).not.toMatch(/withQueryParam\(currentPath, "aylik/);
  });

  it("ContractPanel ?olusturuldu= ile başarı adımını listeden yeniden kurar", () => {
    const panel = read("src/components/contract-panel.tsx");
    expect(panel).toMatch(/searchParams\.get\("olusturuldu"\)/);
    expect(panel).toMatch(/contracts\.find\(\(c\) => c\.id === restoredContractId\)/);
    expect(panel).toMatch(/function showCreated\(created: CreatedContractSummary\)/);
    // Kapatma URL'yi temizler (yenilemede hayalet panel yok).
    expect(panel).toMatch(/withoutQueryParam\(currentPath, "olusturuldu"\)/);
  });

  it("ödemeler sayfası dönüşte hedefe uygun etiket gösterir (opt-in, diğer akışlar etkilenmez)", () => {
    const page = read("src/app/panel/odemeler/[studentId]/page.tsx");
    expect(page).toMatch(/<BackButton[\s\S]*?dynamicLabel/);
    const back = read("src/components/back-button.tsx");
    expect(back).toMatch(/dynamicLabel\?: boolean/);
    expect(back).toMatch(/effectiveLabel = dynamicLabel && safeReturnTo \? returnToLabel\(safeReturnTo\) : label/);
    // Varsayılan davranış değişmedi: dinamik etiket verilmezse sabit etiket.
    expect(back).toMatch(/label = "Geri"/);
  });

  it("zamanlayıcı tercihi sekme-içi saklanır ve listeye karşı yeniden doğrulanır", () => {
    const gen = read("src/components/contract-lesson-schedule-generator.tsx");
    expect(gen).toContain("nevii:schedulegen:");
    expect(gen).toContain("sessionStorage");
    expect(gen).toMatch(/if \(saved && teachers\.some\(\(t\) => t\.id === saved\)\) return saved/);
    expect(gen).toMatch(/if \(saved && rooms\.some\(\(r\) => r\.id === saved\)\) return saved/);
  });
});
