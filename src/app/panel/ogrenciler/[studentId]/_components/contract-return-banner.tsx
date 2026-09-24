import Link from "next/link";
import { Card } from "@/components/ui";

/** Kayıt düzenlenirken sözleşme adımına dönüş (genel bakış + Bilgiler sekmesi aynı bant). */
export function ContractReturnBanner({ studentId }: { studentId: string }) {
  return (
    <Card className="mb-4 !border-[var(--color-primary)] !p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-text)]">
          Kayıt bilgilerini düzenliyorsunuz. Değişiklikleri kaydettikten sonra sözleşme adımına dönün — sözleşme
          formuna girdiğiniz bilgiler korunur, önizleme güncel kayıtla yeniden hesaplanır.
        </p>
        <Link
          href={`/panel/ogrenciler/${studentId}/sozlesmeler?yeniKayit=1`}
          className="inline-flex shrink-0 items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
        >
          Sözleşme adımına dön →
        </Link>
      </div>
    </Card>
  );
}
