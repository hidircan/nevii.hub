import { PageHeader } from "@/components/ui";
import { CsvImportSection } from "@/components/csv-import-section";
import { LessonScheduleImportSection } from "@/components/lesson-schedule-import-section";
import {
  actionPreviewBranchImport,
  actionCommitBranchImport,
  actionPreviewTeacherImport,
  actionCommitTeacherImport,
  actionPreviewRoomImport,
  actionCommitRoomImport,
  actionPreviewStudentImport,
  actionCommitStudentImport,
  actionPreviewHistoricalContractImport,
  actionCommitHistoricalContractImport,
} from "@/lib/actions";
import { BRANCH_CSV_COLUMNS, BRANCH_CSV_SAMPLE } from "@/lib/import/branches";
import { TEACHER_CSV_COLUMNS, TEACHER_CSV_SAMPLE } from "@/lib/import/teachers";
import { ROOM_CSV_COLUMNS, ROOM_CSV_SAMPLE } from "@/lib/import/rooms";
import { STUDENT_CSV_COLUMNS, STUDENT_CSV_SAMPLE } from "@/lib/import/students";
import { HISTORICAL_CONTRACT_CSV_COLUMNS, HISTORICAL_CONTRACT_CSV_SAMPLE } from "@/lib/import/historical-contracts";

export const dynamic = "force-dynamic";

export default function VeriAktarPage() {
  return (
    <div>
      <PageHeader
        title="Veri Aktarım Merkezi"
        description="Şube, öğretmen, oda, öğrenci ve ders programı kayıtlarınızı CSV ile topluca aktarın. Önce önizleyin, hata yoksa aktarın. Güvenli sıra: şube → öğretmen → oda → öğrenci → ders programı."
      />

      <div className="space-y-6">
        <CsvImportSection
          title="1. Şubeler"
          description="Yeni şubeleri toplu ekleyin. Aynı kısa ada sahip bir şube varsa güncellenir."
          columns={BRANCH_CSV_COLUMNS}
          sampleCsv={BRANCH_CSV_SAMPLE}
          sampleFileName="subeler_ornek.csv"
          successHref="/panel/subeler"
          successLinkLabel="Şubeleri görüntüle"
          onPreview={actionPreviewBranchImport}
          onCommit={actionCommitBranchImport}
        />

        <CsvImportSection
          title="2. Öğretmenler"
          description={
            "E-posta zorunludur. Çoklu enstrüman: enstrumanlar/enstruman_seviyeleri kolonlarını \"|\" ile ayırın " +
            "(ör. \"Keman|Piyano\" / \"Orta|Başlangıç\") — sayı/sıra eşleşmeli, tekrar yasak, seviyeler " +
            "Başlangıç/Orta/İleri. Tek enstrümanda eski \"enstruman\" kolonu da çalışır."
          }
          columns={TEACHER_CSV_COLUMNS}
          sampleCsv={TEACHER_CSV_SAMPLE}
          sampleFileName="ogretmenler_ornek.csv"
          successHref="/panel/ogretmenler"
          successLinkLabel="Öğretmenleri görüntüle"
          onPreview={actionPreviewTeacherImport}
          onCommit={actionCommitTeacherImport}
        />

        <CsvImportSection
          title="3. Odalar"
          description="Birden fazla enstrüman için hücre içinde noktalı virgül kullanın (Örn. Piyano;Gitar)."
          columns={ROOM_CSV_COLUMNS}
          sampleCsv={ROOM_CSV_SAMPLE}
          sampleFileName="odalar_ornek.csv"
          successHref="/panel/odalar"
          successLinkLabel="Odaları görüntüle"
          onPreview={actionPreviewRoomImport}
          onCommit={actionCommitRoomImport}
        />

        <CsvImportSection
          title="4. Öğrenciler"
          description={
            "Öğretmen sütununda ARTIK e-posta değil, öğretmenin AD SOYADI kullanılır — aynı adda birden fazla aktif " +
            "öğretmen varsa satır \"Ad Soyad (öğretmen kodu)\" biçimiyle netleştirilmelidir (hata mesajı doğru kodu gösterir). " +
            "ders_suresi yalnızca 30, 40 veya 50 olabilir. dogum_tarihi ve kayit_tarihi \"yyyy-aa-gg\" biçiminde olmalı " +
            "(ör. 2015-03-22). sosyal_medya_izni yalnızca \"Evet\" veya \"Hayır\" kabul eder. tc_kimlik_no opsiyoneldir; " +
            "girilirse şifrelenip saklanır, hiçbir hata/log/export ekranında düz metin görünmez. Öğrenci ve öğretmen " +
            "e-postası sütunları artık şablonda YOK."
          }
          columns={STUDENT_CSV_COLUMNS}
          sampleCsv={STUDENT_CSV_SAMPLE}
          sampleFileName="ogrenciler_ornek.csv"
          successHref="/panel/ogrenciler"
          successLinkLabel="Öğrencileri görüntüle"
          onPreview={actionPreviewStudentImport}
          onCommit={actionCommitStudentImport}
        />

        <LessonScheduleImportSection />

        <CsvImportSection
          title="5. Tarihi Sözleşme Aktarımı (toplu, CSV)"
          description={
            "Geçmişte (sistem dışında) yapılmış öğrenci kayıt sözleşmelerini TOPLU olarak arşive alın — " +
            "en az 100 satır tek seferde desteklenir. Kolonlar sözleşme oluşturma ekranındaki alanlarla AYNIDIR. " +
            "ogrenci_adi ile eşleştirilir; aynı adda birden fazla aktif öğrenci varsa \"Ad Soyad (öğrenci kodu)\" " +
            "biçimi veya ogrenci_kodu kolonu kullanılır. sozlesme_turu: ilk/yenileme/degisiklik. odeme_yontemi: " +
            "nakit/havale/kredi_karti. belge_durumu: arsiv_belgesi/imzali_nusha_mevcut/imza_durumu_bilinmiyor. " +
            "Tüm tarihler yyyy-aa-gg. Bu satırlar YALNIZCA arşiv belgesi olarak eklenir — aktif şablonu ETKİLEMEZ, " +
            "yeni ödeme/taksit kaydı OLUŞTURMAZ, ıslak imza VARSAYMAZ (belge_durumu ile beyan edilen durum aynen kaydedilir)."
          }
          columns={HISTORICAL_CONTRACT_CSV_COLUMNS}
          sampleCsv={HISTORICAL_CONTRACT_CSV_SAMPLE}
          sampleFileName="tarihi_sozlesmeler_sablonu.csv"
          successHref="/panel/evraklar"
          successLinkLabel="Evraklar Merkezi'nde görüntüle"
          onPreview={actionPreviewHistoricalContractImport}
          onCommit={actionCommitHistoricalContractImport}
        />
      </div>
    </div>
  );
}
