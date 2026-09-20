import { defineConfig } from "vitest/config";
import path from "path";
import os from "os";

/**
 * Bu vitest koşusuna ÖZEL, izole veri dizini. Repo kökünden türetilir ki
 * aynı worktree'nin ardışık koşuları aynı dizini kullansın (tek dosya
 * çalıştırmak tam paketten farklı bir yere yazmasın), ama FARKLI
 * worktree'ler birbirine dokunmasın.
 */
const dataDirForThisRun = path.join(
  os.tmpdir(),
  `notaplan-test-${Buffer.from(import.meta.dirname).toString("base64url").slice(-16)}`
);

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/lib/__tests__/**/*.test.ts"],
    // Birden fazla test dosyası STORE_MODE=json altında AYNI dosya deposunu
    // kullanıyor ve her dosya `beforeEach`'te store.json'u siliyor; dosyalar
    // paralel çalışırsa birbirinin verisini sıfırlar (flaky testler).
    fileParallelism: false,
    setupFiles: ["./vitest.setup.ts"],
    env: {
      STORE_MODE: "json",
      VERCEL: "1",
      AGENT_LOG_DEBUG: "0",
      /**
       * 2026-09-20 — SÜREÇLER ARASI İZOLASYON. `fileParallelism: false`
       * yalnız TEK process içindeki dosyaları serileştirir. Aynı makinede
       * ikinci bir koşu (ör. başka bir git worktree'sinde `npm test`, ya da
       * tam paket koşarken tek dosya çalıştırmak) paylaşılan
       * `/tmp/notaplan-data` dizinini siler ve HER İKİ koşu da kodla ilgisi
       * olmayan, her seferinde DEĞİŞEN hatalar üretir — bu tuzağa gerçekten
       * düşüldü (bkz. LESSONS_LEARNED 2026-09-20).
       *
       * Bu koşuya kendi dizinini veriyoruz. Dışarıdan `NOTAPLAN_DATA_DIR`
       * verilirse (CI, hata ayıklama) o kazanır.
       */
      NOTAPLAN_DATA_DIR: process.env.NOTAPLAN_DATA_DIR ?? dataDirForThisRun,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
