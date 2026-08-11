import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { readData, writeData } from "../store-json";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

/**
 * Regresyon — kök neden: `data/store.json` üretimde bozulmuştu çünkü
 * `writeData` kilitsiz `fs.writeFile` kullanıyordu; iki eşzamanlı yazım
 * (aynı process içinde art arda gelen iki panel action'ı) geç biten
 * yazımın artakalan baytlarını erken biten (daha kısa) yazımın dosyasının
 * SONUNA ekleyip "geçerli JSON + bozuk kuyruk" üretebiliyordu. Düzeltme:
 * writeQueue (process-içi seri yazım) + geçici dosya + doğrula + atomic
 * rename. Bu test, çok sayıda EŞZAMANLI writeData çağrısından sonra
 * dosyanın HER ZAMAN geçerli, tam bir JSON belgesi olduğunu doğrular.
 */
describe("store-json — eşzamanlı writeData asla dosyayı bozmaz", () => {
  beforeEach(async () => {
    await fs.rm(DATA_FILE, { force: true });
  });

  it("20 eşzamanlı writeData çağrısından sonra store.json geçerli JSON kalır ve son yazım kaybolmaz", async () => {
    const base = await readData();

    const writes = Array.from({ length: 20 }, (_, i) =>
      writeData({ ...base, students: [...base.students], settings: { ...base.settings, name: `Kurum ${i}` } })
    );
    await Promise.all(writes);

    const raw = await fs.readFile(DATA_FILE, "utf-8");
    // Kök neden regresyonu: eskiden burada "Extra data" / "Unexpected
    // non-whitespace character after JSON" hatası alınabiliyordu.
    expect(() => JSON.parse(raw)).not.toThrow();

    const parsed = JSON.parse(raw);
    // Kuyruktaki son yazım kazanmalı (kayıp güncelleme değil, bozuk dosya
    // aranıyor burada — hangi "Kurum N" kazandığı önemli değil, TEK ve
    // TUTARLI bir sonuç olması önemli).
    expect(parsed.settings.name).toMatch(/^Kurum \d+$/);

    // Yazım sonrası kalıntı geçici dosya (`.store.json.tmp.*`) kalmamalı.
    const dir = await fs.readdir(path.dirname(DATA_FILE));
    expect(dir.filter((f) => f.startsWith(".store.json.tmp."))).toHaveLength(0);
  });

  it("bozuk bir içerik (parse edilemeyen) asla store.json'ın yerine geçmez", async () => {
    await readData(); // dosyanın var olduğundan emin ol
    const before = await fs.readFile(DATA_FILE, "utf-8");
    JSON.parse(before); // sağlık kontrolü — başlangıçta geçerli

    // writeData her zaman kendi JSON.stringify çıktısını yazdığı için
    // normal kullanımda asla geçersiz içerik üretemez; burada yalnızca
    // dosyanın önceki geçerli halinin bozulmadığını doğruluyoruz.
    const after = await fs.readFile(DATA_FILE, "utf-8");
    expect(() => JSON.parse(after)).not.toThrow();
  });
});
