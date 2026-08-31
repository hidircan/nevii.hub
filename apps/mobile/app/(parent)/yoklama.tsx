import { PlaceholderScreen } from "../../src/components/placeholder-screen";

export default function ParentYoklama() {
  return (
    <PlaceholderScreen
      title="Yoklama özeti"
      note="Öğrenci yoklama özeti web tarafında attendance-calendar (dönem bazlı, karmaşık) üzerinden hesaplanıyor; mobil için basit bir GET /api/v1/students/[studentId]/attendance-summary endpoint'i henüz yok."
    />
  );
}
