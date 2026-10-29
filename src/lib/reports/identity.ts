import type { SchoolSettings } from "../types";

/**
 * Rapor üst başlığındaki kurum adı — web formu, rapor sayfası ve PDF/yazdırma AYNI kaynaktan okur. Tam kurum adı
 * (`name`, ör. "Nilüfer Acar Müzik Akademi"); kısa ad (`shortName`, ör. "Nilüfer Acar") tek başına kişi adı gibi
 * okunduğu için yalnız tam ad boşsa kullanılır. Raporu düzenleyen kişi ayrıca "Hazırlayan" olarak yazılır.
 */
export function reportInstitutionName(settings: Pick<SchoolSettings, "name" | "shortName">): string {
  return settings.name?.trim() || settings.shortName?.trim() || "Nevii Hub";
}
