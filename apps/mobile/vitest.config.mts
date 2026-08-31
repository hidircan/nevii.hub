import { defineConfig } from "vitest/config";

/**
 * Yalnızca bağımsız (React Native'siz) saf fonksiyonlar için — rol
 * yönlendirme, veri dönüştürücüler, form doğrulama yardımcıları. Ekranlar/
 * bileşenler için RN test ortamı (jest-expo vb.) bilinçli olarak kurulmadı;
 * bu proje daha önce hiç test altyapısına sahip değildi, kapsam gereksiz
 * genişletilmedi (bkz. MOBILE_PARITY.md).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
