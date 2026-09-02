import { beforeEach } from "vitest";
import { promises as fs } from "fs";
import { INSTRUMENT_CATALOG_FILE } from "./src/lib/instrument-catalog";

/**
 * P0-A/P0-C (2026-09-02) — kök neden: `createStudentTool` artık her kayıtta
 * `resolveActiveInstrumentNames`i (tenant kataloğu, `instrument-catalog.json`)
 * kontrol ediyor. Bu dosya `store.json`'dan AYRI yaşar ve `fileParallelism:
 * false` altında TÜM test dosyaları AYNI `/tmp/notaplan-data` dizinini
 * paylaşır — ama hiçbir dosyanın kendi `beforeEach`'i bunu temizlemiyordu
 * (yalnız `store.json` temizleniyordu). Bir test dosyası (ör.
 * instrument-catalog*.test.ts) "Piyano" gibi varsayılan bir enstrümanı
 * pasife alıp/yeniden adlandırıp bıraktığında, AYNI suite çalıştırmasında
 * SONRA çalışan (ör. "Piyano" sabit metnini kullanan onlarca test dosyası)
 * dosyalar sessizce ve rastgele "aktif değil" hatasıyla kırılabiliyordu —
 * her dosyayı tek tek düzeltmek yerine (yeni dosyalar eklendikçe AYNI
 * sınıf hata tekrarlar), TEK bir global kurulumda, `store.json` ile AYNI
 * mantıkla (var olan dosyayı sil → bir sonraki `listInstrumentCatalog`
 * çağrısı `ensureDefaultCatalogSeeded` ile TÜM varsayılanları aktif olarak
 * yeniden tohumlar) her testten önce sıfırlanır.
 */
beforeEach(async () => {
  await fs.rm(INSTRUMENT_CATALOG_FILE, { force: true });
});
