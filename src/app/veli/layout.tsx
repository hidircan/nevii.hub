import { redirect } from "next/navigation";

/**
 * Ayrı "Veli Portalı" ürünü kaldırıldı (Karma Öğrenci Portalı). Bu layout
 * artık yalnızca eski /veli/** bookmark'larını /ogrenci'ye yönlendirir —
 * asıl sayfa mantığı da her page.tsx içinde ayrıca redirect eder.
 */
export default function VeliLayout() {
  redirect("/ogrenci");
}
