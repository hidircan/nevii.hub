import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireSessionContext } from "@/lib/auth/session";
import { getContractHtmlTool } from "@/lib/services";
import { resolveSafeReturnTo, returnToLabel } from "@/lib/safe-return-to";
import { DocumentPrintActions } from "@/components/document-print-actions";
import { CONTRACT_PRINT_PALETTE as P } from "@/lib/contract-print-theme";

export const dynamic = "force-dynamic";

/** Faz 6 — sekme başlığı (ve tarayıcının "PDF olarak kaydet" varsayılan dosya adı) jenerik değil, öğrenci/dönem/versiyon içerir. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ contractId: string }>;
}): Promise<Metadata> {
  const { contractId } = await params;
  try {
    const session = await requireSessionContext();
    const result = await getContractHtmlTool(session, { contractId });
    if (result.ok) {
      return { title: result.data.titleMain };
    }
  } catch {
    // oturum yoksa/erişim yoksa jenerik başlığa düşülür — sayfa gövdesi zaten login'e yönlendirir.
  }
  return {};
}

/**
 * Sözleşme — A4 yazdırma görünümü. `/evrak-yazdir/[documentId]` ile AYNI
 * desen (panel layout DIŞINDA, kendi kök sayfası) ama admin-only DEĞİL:
 * erişim `getContractHtmlTool` içindeki `canAccessStudent` ile belirlenir —
 * staff (öğretmen HARİÇ) veya sözleşmenin sahibi öğrenci/veli görebilir.
 * Bu sayfa yalnızca GÖRÜNTÜLER/tarayıcı yazdırma diyaloğunu açar — "Yazdırıldı"
 * durumunu değiştiren asıl işlem (printCount++) admin panelindeki ayrı bir
 * aksiyon düğmesidir (bkz. src/app/panel/ogrenciler/[studentId]/contracts).
 */
export default async function ContractPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { contractId } = await params;
  const safeReturnTo = resolveSafeReturnTo((await searchParams).returnTo);
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/sozlesme-yazdir/${contractId}`);
  }

  const result = await getContractHtmlTool(session, { contractId });
  if (!result.ok) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <p className="text-lg font-semibold text-[var(--color-text)]">Sözleşme bulunamadı.</p>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Bu sözleşme silinmiş olabilir veya erişim yetkiniz yok.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-amber-600 hover:text-amber-700">
          Ana sayfaya dön
        </Link>
      </div>
    );
  }

  const isStaff = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  // 9. tur — geri dönüş sözleşmenin AÇILDIĞI ekrana (Evraklar filtreleriyle, öğrenci detayı…).
  // `returnTo` yalnız allowlist'teki panel yollarını kabul eder; yoksa/güvensizse
  // (ör. doğrudan URL) personel için öğrenci detayı varsayılandır. Portal kullanıcısı
  // `returnTo`'dan bağımsız kendi sözleşmeler listesine döner.
  const backHref = isStaff
    ? safeReturnTo ?? `/panel/ogrenciler/${result.data.studentId}`
    : "/ogrenci/sozlesmelerim";
  const backLabel = isStaff ? returnToLabel(backHref) : "Sözleşmelerime dön";

  return (
    <div className="print-light-palette min-h-screen bg-[#f4f2f8] px-4 py-8 print:bg-white print:p-0 sm:px-6">
      <style>{CONTRACT_PRINT_CSS}</style>
      <div className="mx-auto max-w-2xl">
        <DocumentPrintActions backHref={backHref} backLabel={backLabel} />
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 print:hidden">
          Sayfa numarası ve tarih bilgisi için yazdırma penceresinde &quot;Üstbilgiler ve altbilgiler&quot;
          (Headers and footers) seçeneğini açık bırakın — tarayıcı bunu otomatik ekler.
        </p>
        <div className="contract-print-surface rounded-lg border border-[var(--color-border)] p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
          <div className="contract-body">
            <div dangerouslySetInnerHTML={{ __html: result.data.html }} />
          </div>
          <p className="mt-10 text-center text-[11px] text-[var(--color-text-muted)] print:mt-6 print:text-[7pt]">
            Bu belge sistem tarafından oluşturulmuştur ve tek başına imzalı bir sözleşme yerine geçmez.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * P0 (2026-08-30, profesyonel sözleşme baskı tasarımı) — A4/Times New
 * Roman/8pt gövde metni, kurumsal kağıt görünümü. Sayfa numarası ("Sayfa
 * X / Y") CSS Paged Media (`@page { @bottom-center }` / `running()` +
 * `element()`) hiçbir ana akım tarayıcının (Chrome/Edge/Firefox/Safari)
 * `window.print()` motorunda DESTEKLENMEZ — bunu güvenilir şekilde
 * uygulamanın tek yolu sunucu taraflı bir PDF motoru (ör. Puppeteer/headless
 * Chromium) kurmaktır; bu, ayrı bir altyapı kararı gerektirir (bkz.
 * docs/contracts/CONTRACT_PRINT_DESIGN_REPORT.md §sayfa numarası). Bu yüzden
 * burada SAHTE bir sayaç YAZILMADI — bunun yerine tarayıcının kendi native
 * "Headers and footers" yazdırma seçeneği (Chrome/Edge bunu gerçek "1/3"
 * biçiminde otomatik ekler) kullanıcıya ekranda (yazdırılmayan) bir ipucuyla
 * önerilir.
 */
const CONTRACT_PRINT_CSS = `
  /*
   * P0 UAT (2026-09-07) — "PDF tamamen boş beyaz sayfa" HATASININ KÖK NEDENİ.
   *
   * Ölçülen: kullanıcı koyu tema profilindeyken (data-theme-profile="obsidian")
   * baskı medyasında sözleşme yüzeyinin arka planı rgb(23,23,26), başlıkların
   * rengi ise rgba(245,241,232,.96) idi. Tarayıcıların yazdırma diyaloğunda
   * "arka plan grafikleri" VARSAYILAN OLARAK KAPALIDIR: koyu zemin
   * basılmaz, kağıt beyaz kalır, metin ise beyaz kalır → TAMAMEN BOŞ SAYFA.
   *
   * Düzeltme tek yerde ve kök nedende: sözleşme baskı yüzeyi TEMADAN
   * BAĞIMSIZDIR. Tema değişkenleri bu kapsayıcıda açık palete SABİTLENİR, bu
   * sayede içeriye gömülen sözleşme HTML'indeki her \`var(--color-*)\`
   * kullanımı (ve gelecekte eklenecek olanlar) otomatik olarak doğru çözülür.
   * Şablonun kendi bilinçli gri tonları (#888/#555/#777) KORUNUR.
   */
  .contract-print-surface {
    --color-text: ${P.text};
    --color-text-muted: ${P.textMuted};
    --color-surface: ${P.surface};
    --color-surface-muted: ${P.surfaceMuted};
    --color-border: ${P.border};
    --color-primary: ${P.text};
    background: ${P.surface};
    color: ${P.text};
    color-scheme: light;
  }
  /*
   * Başlıklar rengi kapsayıcıdan MİRAS ALMAZ (globals.css'te tema kaynaklı
   * açık bir h1/h2/h3 kuralı var ve özgüllükte mirası yener) — bu yüzden
   * açıkça sabitlenir.
   */
  .contract-print-surface h1,
  .contract-print-surface h2,
  .contract-print-surface h3,
  .contract-print-surface h4,
  .contract-print-surface th {
    color: ${P.text};
  }

  .contract-body {
    font-family: "Times New Roman", Times, "Liberation Serif", serif;
    font-size: 10.5pt;
    line-height: 1.5;
    color: #1a1a1a;
  }
  .contract-body h1 { font-size: 15pt; font-weight: 700; margin: 0 0 4pt; }
  .contract-body h2 { font-size: 12.5pt; font-weight: 700; margin: 10pt 0 4pt; }
  .contract-body h3 { font-size: 10.5pt; font-weight: 700; margin: 10pt 0 4pt; page-break-after: avoid; }
  .contract-body p { margin: 0 0 6pt; text-align: justify; orphans: 3; widows: 3; }
  .contract-body strong { font-weight: 700; }
  .contract-body em { font-style: italic; }
  .contract-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0;
    page-break-inside: avoid;
  }
  .contract-body th,
  .contract-body td {
    border: 1pt solid #333;
    padding: 4pt 6pt;
    font-size: 10pt;
    text-align: left;
    vertical-align: top;
  }
  .contract-body thead th {
    background: #eee;
    font-weight: 700;
  }
  .contract-body tr { page-break-inside: avoid; }
  /* Taksit/tutar hücreleri sağa hizalı — TL tutarları tutarlı okunur. */
  .contract-body td:nth-last-child(1):not(:first-child) { text-align: right; }

  /*
    P0 (2026-09-05) — TEK BİRLEŞİK ÇIKTI: ana sözleşme + KVKK eki +
    fotoğraf/video eki aynı sayfada art arda. Ekler ekranda kalın bir
    ayraçla, baskıda ise KENDİ SAYFASINDA başlar (composeContractOutputHtml
    satır-içi break-before verir; buradaki kural onu sınıf üzerinden de
    garantiler).
  */
  .contract-body .contract-annex { margin-top: 32px; padding-top: 24px; }
  .contract-body .contract-annex-ref {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-weight: 700;
    color: #444;
  }
  /*
   * P1 revizyonu — sözleşme metninin TAMAMI (paragraf, başlık, tablo,
   * dipnot, ek referans satırı dahil) HER ZAMAN Times New Roman; ekran,
   * baskı ve PDF çıktısında aynı. Kök neden: globals.css'teki
   * \`body * { font-family: var(--font-sans) !important; }\` ve
   * \`h1,h2,h3 { font-family: var(--font-display) !important; }\` kuralları,
   * kullanıcının genel arayüz font seçimini (Inter/Gloock/…) sözleşme
   * çıktısına da dayatıyordu (buradaki \`!important\`'sız .contract-body
   * kuralını yeniyordu). Bu sabitleme YALNIZCA sözleşme kapsamındadır
   * (.contract-print-surface altı) — genel uygulama font tercihini
   * ETKİLEMEZ. Özgüllük + kaynak sırası bilinçli seçildi: globals.css
   * kurallarını yener, yukarıdaki ek-referans sans kuralını da bu kapsama
   * dahil eder.
   */
  .contract-print-surface .contract-body,
  .contract-print-surface .contract-body * {
    font-family: "Times New Roman", Times, "Liberation Serif", serif !important;
  }

  @media print {
    @page { size: A4; margin: 16mm 14mm; }
    .contract-body .contract-annex { break-before: page; page-break-before: always; border-top: none; }
    .contract-body .contract-annex-ref { font-size: 7pt; }
    /*
     * Arka plan grafikleri AÇIK olsa bile kağıt beyaz, metin koyu kalır —
     * iki yazdırma ayarında da okunur çıktı.
     */
    .contract-print-surface { padding: 0; background: ${P.surface}; color: ${P.text}; }
    .contract-body {
      font-size: 8pt;
      line-height: 1.35;
    }
    .contract-body h1 { font-size: 12pt; }
    .contract-body h2 { font-size: 10pt; }
    .contract-body h3 { font-size: 8pt; }
    .contract-body th,
    .contract-body td { font-size: 7.5pt; padding: 3pt 4pt; }
  }
`;
