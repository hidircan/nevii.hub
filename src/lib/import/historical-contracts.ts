/**
 * P0 (2026-08-31) — Veri Aktarım Merkezi: tarihi (geçmiş) öğrenci kayıt
 * sözleşmelerinin TOPLU CSV içe aktarımı. Kolonlar, canlı sözleşme oluşturma
 * ekranının (`ContractPanel`/`createContract`, bkz. `src/lib/contracts.ts`)
 * girdi alanlarına karşılık gelir — ayrı bir şema İCAT EDİLMEDİ.
 *
 * BİLİNÇLİ TASARIM KARARI: içe aktarılan satırlar `createContract()`'ın TAM
 * mali doğrulama hattından (ilk ödeme/taksit tutarı eşleşmesi, ödeme
 * penceresi kontrolü, yenileme borç kapısı vb.) GEÇMEZ — bu kurallar YENİ,
 * CANLI kayıtlar için anlamlıdır; geçmiş, sistem dışında zaten gerçekleşmiş
 * sözleşmeler için "aylık taksit tutarı ilk ödemeyle birebir eşleşmeli" gibi
 * bir kısıt dayatmak, gerçek tarihi veriyi REDDETMEK anlamına gelirdi. Bunun
 * yerine her satır doğrudan bir ARŞİV `DocumentInstance` (kind=
 * student_enrollment_contract, status="uploaded" — "sistem dışından
 * kaynaklanan belge" için zaten kullanılan durum) olarak oluşturulur; hiçbir
 * `StudentContract`/`Payment` satırı YARATILMAZ (bkz.
 * docs/imports/HISTORICAL_CONTRACT_IMPORT_REPORT.md). Aktif şablon
 * OTOMATİK ETKİNLEŞTİRİLMEZ/DEĞİŞTİRİLMEZ — yalnızca mevcut aktif şablon
 * (varsa) render için KULLANILIR; yoksa satır düz metin özet olarak
 * saklanır (render edilecek bodyHtml olmadan, hata ÜRETMEZ).
 */
import type { AppData } from "../types";
import type { CsvRecord } from "./csv";
import type { ImportPreview, ImportRowError, ImportReadRow } from "./types";
import { IMPORT_READ_ROWS_PREVIEW_LIMIT } from "./types";
import { resolveStudentForScheduleRow } from "./branch-lookup";

export type HistoricalContractDocumentStatus = "arsiv_belgesi" | "imzali_nusha_mevcut" | "imza_durumu_bilinmiyor";

export type HistoricalContractImportRow = {
  studentId: string;
  studentName: string;
  contractType: "initial" | "renewal" | "amendment";
  programmeName: string;
  enrollmentStartDate: string; // yyyy-MM-dd
  enrollmentEndDate: string; // yyyy-MM-dd
  durationMonths: number;
  monthlyAmount: number;
  installmentCount: number;
  paymentMethod: "cash" | "transfer" | "credit_card";
  signatoryFullName: string;
  contractDate: string; // yyyy-MM-dd — sözleşmenin fiilen imzalandığı/düzenlendiği tarih
  documentStatus: HistoricalContractDocumentStatus;
  notes: string;
};

export const HISTORICAL_CONTRACT_CSV_COLUMNS = [
  "ogrenci_adi",
  "ogrenci_kodu",
  "sozlesme_turu",
  "program_adi",
  "baslangic_tarihi",
  "bitis_tarihi",
  "sure_ay",
  "aylik_ucret",
  "taksit_sayisi",
  "odeme_yontemi",
  "veli_ad_soyad",
  "sozlesme_tarihi",
  "belge_durumu",
  "not",
] as const;

export const HISTORICAL_CONTRACT_CSV_SAMPLE = `ogrenci_adi,ogrenci_kodu,sozlesme_turu,program_adi,baslangic_tarihi,bitis_tarihi,sure_ay,aylik_ucret,taksit_sayisi,odeme_yontemi,veli_ad_soyad,sozlesme_tarihi,belge_durumu,not
Deniz Ak,,ilk,Piyano,2024-09-01,2025-06-01,9,2500,9,nakit,Ayşe Ak,2024-08-28,imzali_nusha_mevcut,
Ece Yılmaz,,yenileme,Keman,2024-09-01,2025-09-01,12,5800,12,havale,Merve Yılmaz,2024-08-30,arsiv_belgesi,Önceki sözleşmenin devamı
Kerem Doğan,,ilk,Gitar,2024-10-01,2025-01-01,3,4200,3,kredi_karti,Fatma Doğan,2024-09-25,imza_durumu_bilinmiyor,
`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CONTRACT_TYPE_MAP: Record<string, HistoricalContractImportRow["contractType"]> = {
  ilk: "initial",
  yenileme: "renewal",
  degisiklik: "amendment",
  değişiklik: "amendment",
};

const PAYMENT_METHOD_MAP: Record<string, HistoricalContractImportRow["paymentMethod"]> = {
  nakit: "cash",
  havale: "transfer",
  eft: "transfer",
  kredi_karti: "credit_card",
  "kredi kartı": "credit_card",
  kredikarti: "credit_card",
};

const DOCUMENT_STATUS_VALUES: HistoricalContractDocumentStatus[] = [
  "arsiv_belgesi",
  "imzali_nusha_mevcut",
  "imza_durumu_bilinmiyor",
];

function num(value: string): number | null {
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function validateHistoricalContractRows(data: AppData, records: CsvRecord[]): ImportPreview<HistoricalContractImportRow> {
  const errors: ImportRowError[] = [];
  const valid: HistoricalContractImportRow[] = [];
  const readRows: ImportReadRow[] = [];

  records.forEach((rec, idx) => {
    const rowNum = idx + 2; // 1. satır başlık
    const get = (col: string) => (rec[col] ?? "").trim();
    const err = (field: string, message: string) => errors.push({ row: rowNum, field, message });

    const studentNameRaw = get("ogrenci_adi");
    const studentCodeRaw = get("ogrenci_kodu");
    const studentRes = resolveStudentForScheduleRow(data, studentNameRaw, studentCodeRaw);
    if (!studentRes.ok) {
      err("ogrenci_adi", studentRes.message);
    }

    const contractTypeRaw = get("sozlesme_turu").toLocaleLowerCase("tr");
    const contractType = CONTRACT_TYPE_MAP[contractTypeRaw];
    if (!contractType) {
      err("sozlesme_turu", `Geçersiz sözleşme türü: "${get("sozlesme_turu")}" — ilk, yenileme veya degisiklik olmalı.`);
    }

    const programmeName = get("program_adi");
    if (!programmeName) err("program_adi", "Program adı boş olamaz.");

    const startDate = get("baslangic_tarihi");
    if (!DATE_RE.test(startDate)) err("baslangic_tarihi", "Tarih yyyy-aa-gg biçiminde olmalı (ör. 2024-09-01).");
    const endDate = get("bitis_tarihi");
    if (!DATE_RE.test(endDate)) err("bitis_tarihi", "Tarih yyyy-aa-gg biçiminde olmalı (ör. 2025-06-01).");
    const contractDate = get("sozlesme_tarihi");
    if (!DATE_RE.test(contractDate)) err("sozlesme_tarihi", "Tarih yyyy-aa-gg biçiminde olmalı (ör. 2024-08-28).");

    const durationMonths = num(get("sure_ay"));
    if (durationMonths === null || durationMonths < 1 || durationMonths > 12) {
      err("sure_ay", "1-12 arası bir tam sayı olmalı.");
    }

    const monthlyAmount = num(get("aylik_ucret"));
    if (monthlyAmount === null || monthlyAmount <= 0) err("aylik_ucret", "Pozitif bir sayı olmalı.");

    const installmentCount = num(get("taksit_sayisi"));
    if (installmentCount === null || installmentCount < 1 || installmentCount > 12) {
      err("taksit_sayisi", "1-12 arası bir tam sayı olmalı.");
    }

    const paymentMethodRaw = get("odeme_yontemi").toLocaleLowerCase("tr");
    const paymentMethod = PAYMENT_METHOD_MAP[paymentMethodRaw];
    if (!paymentMethod) {
      err("odeme_yontemi", `Geçersiz ödeme yöntemi: "${get("odeme_yontemi")}" — nakit, havale veya kredi_karti olmalı.`);
    }

    const signatoryFullName = get("veli_ad_soyad");
    if (!signatoryFullName) err("veli_ad_soyad", "Veli/imza sahibi adı boş olamaz.");

    const documentStatusRaw = get("belge_durumu").toLocaleLowerCase("tr");
    const documentStatus = DOCUMENT_STATUS_VALUES.includes(documentStatusRaw as HistoricalContractDocumentStatus)
      ? (documentStatusRaw as HistoricalContractDocumentStatus)
      : null;
    if (!documentStatus) {
      err(
        "belge_durumu",
        `Geçersiz belge durumu: "${get("belge_durumu")}" — arsiv_belgesi, imzali_nusha_mevcut veya imza_durumu_bilinmiyor olmalı.`
      );
    }

    const rowErrorsBefore = errors.filter((e) => e.row === rowNum).length;
    if (rowErrorsBefore === 0 && studentRes.ok && contractType && documentStatus && paymentMethod) {
      valid.push({
        studentId: studentRes.studentId,
        studentName: studentNameRaw || studentRes.studentId,
        contractType,
        programmeName,
        enrollmentStartDate: startDate,
        enrollmentEndDate: endDate,
        durationMonths: durationMonths!,
        monthlyAmount: monthlyAmount!,
        installmentCount: installmentCount!,
        paymentMethod,
        signatoryFullName,
        contractDate,
        documentStatus,
        notes: get("not"),
      });
    }

    if (readRows.length < IMPORT_READ_ROWS_PREVIEW_LIMIT) {
      readRows.push({
        row: rowNum,
        summary: `${studentNameRaw || "?"} — ${programmeName || "?"} — ${startDate || "?"}–${endDate || "?"}`,
      });
    }
  });

  return {
    totalRows: records.length,
    validCount: valid.length,
    errorCount: errors.length,
    errors,
    valid,
    readRows,
  };
}
