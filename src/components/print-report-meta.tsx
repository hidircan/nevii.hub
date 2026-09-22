import type { ReactNode } from "react";

/**
 * Yazdırılabilir raporların ortak künyesi: kurum, rapora özel satırlar,
 * raporu alan kişi (ad soyad) ve alınma tarih/saati. Tüm rapor baskıları
 * (hakediş, ödeme geçmişi, performans, öğrenci dökümleri) bunu kullanır.
 */
export function PrintReportMeta({
  institution,
  rows,
  viewer,
  printedAt,
}: {
  institution: string;
  rows: [label: string, value: ReactNode][];
  viewer: string;
  printedAt: string;
}) {
  const all: [string, ReactNode][] = [["Kurum", institution], ...rows, ["Raporu alan", viewer], ["Rapor tarihi", printedAt]];
  return (
    <dl className="print-report-meta mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {all.map(([label, value]) => (
        <div key={label}>
          <dt className="inline font-semibold">{label}: </dt>
          <dd className="inline">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
