/**
 * Tek merkez, process-güvenli JSON dosya yazımı. Kök neden (bkz.
 * store-json.ts `writeData` yorumu, aynı sınıf): bu depodaki JSON-dosya
 * tabanlı yardımcı modüllerin (enstrüman kataloğu, kapalı gün, sosyal medya
 * izni, ödev, görev hatırlatma vb.) HER BİRİ kendi `saveAll`/`writeFile`
 * çağrısını kilitsiz yapıyordu. Aynı fiziksel dosyaya eşzamanlı iki yazım
 * (aynı process içinde art arda gelen iki istek/test, VEYA aynı `data/`
 * dizinini paylaşan birden fazla process — ör. paralel çalışan birden
 * fazla `npm test`/dev sunucusu) şu sonuçlardan birini üretebilir:
 *   - Bozuk dosya: geç biten yazımın artakalan baytları erken biten
 *     (daha kısa) yazımın sonuna eklenir → "Unexpected non-whitespace
 *     character after JSON" (bu, `data/store.json`'da gerçekleşen olaydı).
 *   - Kayıp güncelleme (lost update): iki yazım da tam/geçerli JSON üretir
 *     ama SON biten kazanır — diğerinin eklediği kayıt sessizce kaybolur
 *     (enstrüman kataloğunda gözlemlenen: ilk toplu seed'in bir kısmı,
 *     sonra çalışan başka bir process'in DAHA KÜÇÜK bir listeyle yaptığı
 *     `saveAll` tarafından ezildi).
 *
 * Bu modül HER İKİ sınıfı da azaltır:
 *   1) Bozulmayı KESİN olarak önler — her yazım önce benzersiz bir geçici
 *      dosyaya yazılır, geri okunup `JSON.parse` ile doğrulanır, ancak
 *      SONRA `fs.rename` ile hedefin yerine konur (POSIX'te aynı dosya
 *      sistemi içinde atomiktir — okuyan hiçbir süreç yarım içerik göremez).
 *   2) Kayıp güncelleme riskini AZALTIR — `withFileLock` aynı process
 *      içindeki tüm okuma-değiştir-yazma döngülerini dosya bazında bir
 *      promise kuyruğunda SERİLEŞTİRİR. Süreçler ARASI (cross-process)
 *      kilit bu basit dosya tabanlı depo için kapsam dışıdır — `json`/
 *      `memory` modu zaten yalnızca yerel geliştirme/demo için tasarlanmıştır
 *      (bkz. CLAUDE.md); üretimde `db` modu (Prisma, gerçek transaction'lar)
 *      kullanılır. Birden fazla process'in AYNI `data/` dizinini paylaştığı
 *      senaryolarda (ör. paralel dev sunucusu + paralel test koşusu) bu
 *      kuyruk hâlâ koruma SAĞLAMAZ — bkz. CLAUDE.md "Test gotcha".
 */

import { promises as fs } from "fs";
import path from "path";

const fileLocks = new Map<string, Promise<unknown>>();

/**
 * `filePath`'e karşı `fn`'in aynı process içinde SERİ (bir seferde tek)
 * çalışmasını garanti eder — okuma-değiştir-yazma döngülerinin (readAll →
 * mutate → saveAll) yarışıp birbirinin sonucunu ezmesini (lost update)
 * önlemek için `saveAll`'ı çağıran fonksiyonların TAMAMI bunu kullanmalı.
 */
export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(filePath);
  const prior = fileLocks.get(key) ?? Promise.resolve();
  let release: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  fileLocks.set(
    key,
    prior.then(() => gate)
  );
  await prior;
  try {
    return await fn();
  } finally {
    release!();
  }
}

/**
 * `filePath`'e `data`'yı ATOMİK biçimde yazar: geçici dosya → doğrula →
 * rename. `withFileLock` ile SARMALANMADAN çağrılırsa yalnızca bozulmayı
 * önler, kayıp güncellemeyi önlemez — çağıran taraf kendi okuma-değiştir-
 * yazma döngüsünü `withFileLock` içine almalı (bkz. yukarıdaki modül notu).
 */
export async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const serialized = JSON.stringify(data, null, 2);
  JSON.parse(serialized); // yazılacak içeriğin kendi başına geçerli JSON olduğunu garantile

  const tmpFile = path.join(
    dir,
    `.${path.basename(filePath)}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`
  );
  const handle = await fs.open(tmpFile, "w");
  try {
    await handle.writeFile(serialized, "utf-8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  // Doğrulama: geçici dosyayı geri okuyup parse et — bozuk/yarım bir içerik
  // asla hedef dosyanın yerine geçmesin.
  const check = await fs.readFile(tmpFile, "utf-8");
  JSON.parse(check);
  await fs.rename(tmpFile, filePath);
}
