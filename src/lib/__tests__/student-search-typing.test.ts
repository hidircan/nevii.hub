import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * P0 UAT REGRESYONU (2026-09-07) — "öğrenciler ekranında ad aratırken ciddi kasılma".
 *
 * KÖK NEDEN (gerçek tarayıcıda ölçüldü): arama terimi yalnızca URL'de
 * tutuluyor ve input doğrudan `searchParams`'a bağlıydı. Her tuş
 * `router.replace` → `force-dynamic` sayfa → SUNUCU RSC turu → tenant'ın TÜM
 * verisini okuyan `readScopedData()`. Ölçülen: 6 harflik aramada 12 istek
 * (6'sı gerçek RSC turu). Ayrıca input URL'den beslendiği için yazılan
 * karakter navigasyon bitene kadar görünmüyordu.
 *
 * Düzeltme sonrası ölçüm: tuş başına input geri bildirimi en fazla 20 ms,
 * yazma boyunca GERÇEK RSC turu sayısı 1 (o da yazma bittikten 250 ms sonra;
 * kalan istekler Next'in ucuz prefetch'leri).
 */
const SRC = readFileSync(
  path.resolve(import.meta.dirname, "../../components/students-table.tsx"),
  "utf-8"
);
/** Yorumlar hariç kod — yasaklı kalıp açıklamada geçebilir. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("Öğrenci araması — yazma asla sunucuyu beklemez", () => {
  it("arama input'u YEREL state ile sürülür, searchParams ile DEĞİL", () => {
    expect(CODE).toMatch(/value=\{searchInput\}/);
    expect(CODE).toMatch(/onChange=\{\(event\) => setSearchInput\(event\.target\.value\)\}/);
    // Regresyon: input'un URL'e doğrudan yazması.
    expect(CODE).not.toMatch(/onChange=\{\(event\) => setSingle\("q"/);
  });

  it("URL senkronu GECİKMELİDİR (tuş başına navigasyon yok)", () => {
    expect(CODE).toMatch(/setTimeout\([\s\S]{0,400}?router\.replace/);
    expect(CODE).toMatch(/\}, 250\)/);
    expect(CODE).toMatch(/clearTimeout\(id\)/);
  });

  it("URL dışarıdan değişince (geri/ileri, derin bağlantı) input senkronlanır", () => {
    // Effect değil, React'in "prop değişince state ayarla" deseni.
    expect(CODE).toMatch(/if \(urlSearch !== lastUrlSearch\)[\s\S]{0,120}setSearchInput\(urlSearch\)/);
  });

  it("filtreleme yerel değerle yapılır — sonuç için sunucu turu beklenmez", () => {
    expect(CODE).toMatch(/const search = searchInput;/);
    expect(CODE).toMatch(/const filterQuery = search\.trim\(\)\.toLowerCase\(\)/);
  });
});
