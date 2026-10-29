import { PlaceholderScreen } from "../../src/components/placeholder-screen";
import { useLocale } from "../../src/i18n/locale-context";

/**
 * Öğretmen listesi + her öğretmen için teacher-performance-v2 özet kartı.
 * Web tarafında src/app/panel/ogretmenler/page.tsx bunu server component
 * içinde readScopedData + computeTeacherPerformanceReportV2 ile üretiyor.
 * Mobil için tek bir liste + skor bulunmuyor: GET /api/v1/teachers (liste)
 * eksik — yalnız /api/v1/teachers/[teacherId]/performance-v2 (TEK öğretmen)
 * var. Liste ekranı gerçek veriyle çalışabilmesi için ya yeni bir toplu
 * GET /api/v1/teachers endpoint'i ya da mevcut tekil endpoint'in id listesi
 * üzerinden N ayrı çağrıyla (kabul edilebilir N+1 değil) beslenmesi gerekir.
 */
export default function AdminOgretmenler() {
  const { t: tr } = useLocale();
  return (
    <PlaceholderScreen
      title={tr("adm.teachersTitle")}
      note={tr("adm.teachersNote")}
    />
  );
}
