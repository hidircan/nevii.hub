/**
 * Sözleşme REVİZYON (amendment) fark hesabı — 10. tur iş #4.
 *
 * Revizyon, önceki sözleşmenin TÜM değerleriyle ön-doldurulmuş formdan yeni
 * bir `amendment` sürümü üretir; önceki sürüm `superseded` olarak DEĞİŞMEDEN
 * arşivde kalır (yerinde mutasyon YOK). Bu modül, formdaki güncel değerlerle
 * önceki sözleşmeyi karşılaştırıp "Değişiklik özeti" satırlarını üretir:
 * değişen HER alan `eski → yeni` olarak listelenir, hiç değişiklik yoksa
 * boş dizi döner (gönderim engellenir — boş revizyon anlamsızdır).
 *
 * Saf fonksiyonlar, I/O yok: hem istemci bileşeni
 * (`contract-panel.tsx`) hem testler kullanır.
 */

import { formatDateTr } from "./timezone";
import { paymentMethodLabelTr } from "./utils";

function formatTL(n: number): string {
  return `${new Intl.NumberFormat("tr-TR").format(n)} TL`;
}

export type RevisionComparable = {
  programmeName?: string;
  monthlyAmount?: number | "";
  durationMonths?: number;
  installmentCount?: number;
  /** Tarih-girdi biçimi (yyyy-MM-dd) veya ISO — yalnız gün kısmı karşılaştırılır. */
  enrollmentStartDate?: string;
  enrollmentEndDate?: string;
  firstDueDate?: string;
  paymentMethod?: string;
  depositAmount?: number | "";
  lessonScheduleText?: string;
  signatoryFullName?: string;
  photoVideoConsent?: "granted" | "denied" | "unset";
  kvkkNoticeDelivered?: boolean;
};

export type RevisionDiffEntry = {
  key: string;
  label: string;
  before: string;
  after: string;
};

function asDay(value: string | undefined): string {
  return (value ?? "").slice(0, 10);
}

function formatDay(value: string | undefined): string {
  const day = asDay(value);
  return day ? formatDateTr(day) : "—";
}

function asAmount(value: number | "" | undefined): number | null {
  if (value === "" || value === undefined || value === null) return null;
  return Number(value);
}

function formatAmount(value: number | "" | undefined): string {
  const n = asAmount(value);
  return n === null ? "—" : formatTL(n);
}

function formatText(value: string | undefined): string {
  const t = (value ?? "").trim();
  return t ? t : "—";
}

/**
 * Önceki sözleşme (`prev`) ile formdaki güncel değerler (`next`)
 * arasındaki FARKLI alanları, sabit sırada döner.
 */
export function diffContractRevision(prev: RevisionComparable, next: RevisionComparable): RevisionDiffEntry[] {
  const out: RevisionDiffEntry[] = [];
  const push = (key: string, label: string, before: string, after: string) => {
    if (before !== after) out.push({ key, label, before, after });
  };
  push("programmeName", "Program", formatText(prev.programmeName), formatText(next.programmeName));
  push("monthlyAmount", "Aylık ücret", formatAmount(prev.monthlyAmount), formatAmount(next.monthlyAmount));
  push(
    "durationMonths",
    "Süre",
    prev.durationMonths ? `${prev.durationMonths} ay` : "—",
    next.durationMonths ? `${next.durationMonths} ay` : "—"
  );
  push(
    "installmentCount",
    "Taksit sayısı",
    prev.installmentCount ? String(prev.installmentCount) : "—",
    next.installmentCount ? String(next.installmentCount) : "—"
  );
  push("enrollmentStartDate", "Sözleşme başlangıcı", formatDay(prev.enrollmentStartDate), formatDay(next.enrollmentStartDate));
  push("enrollmentEndDate", "Sözleşme bitişi", formatDay(prev.enrollmentEndDate), formatDay(next.enrollmentEndDate));
  push("firstDueDate", "1. taksit vadesi", formatDay(prev.firstDueDate), formatDay(next.firstDueDate));
  push(
    "paymentMethod",
    "Ödeme yöntemi",
    paymentMethodLabelTr(prev.paymentMethod) || "—",
    paymentMethodLabelTr(next.paymentMethod) || "—"
  );
  push("depositAmount", "Kaparo / depozito", formatAmount(prev.depositAmount), formatAmount(next.depositAmount));
  push(
    "lessonScheduleText",
    "Ders günü / saati",
    formatText(prev.lessonScheduleText),
    formatText(next.lessonScheduleText)
  );
  push(
    "signatoryFullName",
    "İmzalayan",
    formatText(prev.signatoryFullName),
    formatText(next.signatoryFullName)
  );
  const consentLabel = (v: "granted" | "denied" | "unset" | undefined) =>
    v === "granted" ? "İzin verildi" : v === "denied" ? "İzin verilmedi" : "Belirtilmedi";
  push(
    "photoVideoConsent",
    "Fotoğraf/Video rızası",
    consentLabel(prev.photoVideoConsent),
    consentLabel(next.photoVideoConsent)
  );
  push(
    "kvkkNoticeDelivered",
    "KVKK bilgilendirme",
    prev.kvkkNoticeDelivered ? "Yapıldı" : "Yapılmadı",
    next.kvkkNoticeDelivered ? "Yapıldı" : "Yapılmadı"
  );
  return out;
}

/**
 * Revize edilen sözleşmenin taksit MOTORU tespiti: ders-başı motoruyla
 * üretilmiş planların snapshot satırlarında `kind` doludur, sabit taksit
 * motorunun satırlarında YOKTUR (bkz. contracts.ts buildInstallmentSchedule
 * vs buildPerLessonInstallmentSchedule). Revizyon ÖNİZLEMESİ ve üretimi
 * önceki sözleşmeyle AYNI motordan geçmelidir — aksi halde "aynı değerlerle
 * revize" bile farklı bir plan üretir (sessiz motor değişimi).
 */
export function previousContractUsesPerLessonBilling(snapshot?: {
  installments?: Array<{ kind?: string }>;
}): boolean {
  return (snapshot?.installments ?? []).some((r) => !!r.kind);
}
