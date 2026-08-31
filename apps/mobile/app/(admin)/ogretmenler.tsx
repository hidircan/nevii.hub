import { PlaceholderScreen } from "../../src/components/placeholder-screen";

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
  return (
    <PlaceholderScreen
      title="Öğretmenler"
      note="Öğretmen listesi + v2 performans skoru için GET /api/v1/teachers (liste) endpoint'i henüz yok — yalnız tekil /api/v1/teachers/[teacherId]/performance-v2 mevcut."
    />
  );
}
