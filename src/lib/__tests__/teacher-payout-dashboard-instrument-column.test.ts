import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * PRODUCT_BACKLOG §3.4 — hakediş tablosunda "Enstrüman" sütunu kaldırılır.
 * Bu proje component testleri için jsdom/RTL kurulu değil (vitest.config.mts
 * `environment: "node"`) — bu yüzden kaynak dosya üzerinde doğrudan, ucuz ve
 * güvenilir bir statik kontrol yapılır: sütun başlığı/hücresi artık üretilmez.
 */
describe("TeacherPayoutDashboard — Enstrüman sütunu kaldırıldı", () => {
  it("'Enstrüman' başlığı veya line.instrument hücresi kaynak dosyada yer almaz", () => {
    const filePath = path.join(process.cwd(), "src/components/teacher-payout-dashboard.tsx");
    const source = readFileSync(filePath, "utf8");
    expect(source).not.toContain("Enstrüman");
    expect(source).not.toContain("line.instrument");
  });
});
