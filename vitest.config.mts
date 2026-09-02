import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/lib/__tests__/**/*.test.ts"],
    // Birden fazla test dosyası STORE_MODE=json altında aynı paylaşılan
    // /tmp/notaplan-data/store.json dosyasını kullanıyor; dosyalar paralel
    // çalışırsa birbirinin verisini sıfırlayıp bozabiliyor (flaky testler).
    fileParallelism: false,
    setupFiles: ["./vitest.setup.ts"],
    env: {
      STORE_MODE: "json",
      VERCEL: "1",
      AGENT_LOG_DEBUG: "0",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
