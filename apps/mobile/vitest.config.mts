import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Yalnızca bağımsız (React Native'siz) saf fonksiyonlar için — rol
 * yönlendirme, veri dönüştürücüler, form doğrulama yardımcıları. Ekranlar/
 * bileşenler için RN test ortamı (jest-expo vb.) bilinçli olarak kurulmadı;
 * bu proje daha önce hiç test altyapısına sahip değildi, kapsam gereksiz
 * genişletilmedi (bkz. MOBILE_PARITY.md).
 */
export default defineConfig({
  resolve: {
    alias: {
      // Node testlerinde cihaz deposu yerine bellek sazı (bkz. src/test-stubs).
      "expo-secure-store": fileURLToPath(new URL("./src/test-stubs/expo-secure-store.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
