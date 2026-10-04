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
  /** 2026-10-04 — imzacı kimliği/adresi/yakınlığı da revizyon konusudur (eskiden karşılaştırılmıyordu). */
  signatoryNationalId?: string;
  signatoryAddress?: string;
  signatoryRelationship?: string;
  photoVideoConsent?: "granted" | "denied" | "unset";
  /** Rıza kapsamı (kanal listesi) — sıra önemsiz. */
  photoScopes?: string[];
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
  // T.C. ekranda maskeli gösterilir; karşılaştırma tam değer üzerinden yapılır.
  if ((prev.signatoryNationalId ?? "").trim() !== (next.signatoryNationalId ?? "").trim()) {
    out.push({
      key: "signatoryNationalId",
      label: "İmzalayan T.C. kimlik no",
      before: maskId(prev.signatoryNationalId),
      after: maskId(next.signatoryNationalId),
    });
  }
  push("signatoryAddress", "İmzalayan adresi", formatText(prev.signatoryAddress), formatText(next.signatoryAddress));
  push("signatoryRelationship", "İmzalayan yakınlığı", formatText(prev.signatoryRelationship), formatText(next.signatoryRelationship));
  const consentLabel = (v: "granted" | "denied" | "unset" | undefined) =>
    v === "granted" ? "İzin verildi" : v === "denied" ? "İzin verilmedi" : "Belirtilmedi";
  push(
    "photoVideoConsent",
    "Fotoğraf/Video rızası",
    consentLabel(prev.photoVideoConsent),
    consentLabel(next.photoVideoConsent)
  );
  if (prev.photoScopes !== undefined && next.photoScopes !== undefined) {
    push("photoScopes", "Rıza kapsamı", [...prev.photoScopes].sort().join(", ") || "—", [...next.photoScopes].sort().join(", ") || "—");
  }
  push(
    "kvkkNoticeDelivered",
    "KVKK bilgilendirme",
    prev.kvkkNoticeDelivered ? "Yapıldı" : "Yapılmadı",
    next.kvkkNoticeDelivered ? "Yapıldı" : "Yapılmadı"
  );
  return out;
}

function maskId(value: string | undefined): string {
  const t = (value ?? "").trim();
  return t ? `•••••••••${t.slice(-2)}` : "—";
}

export type PlanRow = { sequence: number; amount: number; dueDate: string };

/**
 * 2026-10-04 KÖK NEDEN ("değişiklik yaptım ama değişiklik yok diyor"): revizyon farkı yalnız form başlık
 * alanlarını karşılaştırıyordu; ödeme planındaki elle tutar/vade değişikliği, son dönem tutarı ve
 * imzacı T.C./adresi hiç görülmüyordu. Bu fonksiyon önizlenen planı önceki sürümün dondurulmuş planıyla
 * satır satır karşılaştırır (tutar + vade günü + satır sayısı).
 */
export function diffInstallmentPlan(prev: PlanRow[], next: PlanRow[]): RevisionDiffEntry[] {
  const out: RevisionDiffEntry[] = [];
  const bySeq = (rows: PlanRow[]) => new Map(rows.map((r) => [r.sequence, r]));
  const a = bySeq(prev);
  const b = bySeq(next);
  const seqs = Array.from(new Set([...a.keys(), ...b.keys()])).sort((x, y) => x - y);
  for (const seq of seqs) {
    const p = a.get(seq);
    const n = b.get(seq);
    if (!p || !n) {
      out.push({
        key: `plan-${seq}`,
        label: `${seq}. taksit`,
        before: p ? `${formatTL(p.amount)} · ${formatDay(p.dueDate)}` : "yok",
        after: n ? `${formatTL(n.amount)} · ${formatDay(n.dueDate)}` : "yok",
      });
      continue;
    }
    if (p.amount !== n.amount) {
      out.push({ key: `plan-${seq}-amount`, label: `${seq}. taksit tutarı`, before: formatTL(p.amount), after: formatTL(n.amount) });
    }
    if (asDay(p.dueDate) !== asDay(n.dueDate)) {
      out.push({ key: `plan-${seq}-due`, label: `${seq}. taksit vadesi`, before: formatDay(p.dueDate), after: formatDay(n.dueDate) });
    }
  }
  return out;
}

/**
 * Sunucu tarafı mükerrer sürüm kontrolü: önceki sürümle başlık alanları VE plan aynıysa revizyon anlamsızdır.
 * İstemci farkı yanlış hesaplasa/atlansa bile aynı veriden ikinci sürüm üretilmez.
 */
export function isIdenticalRevision(
  prev: RevisionComparable & { plan: PlanRow[] },
  next: RevisionComparable & { plan: PlanRow[] }
): boolean {
  return diffContractRevision(prev, next).length === 0 && diffInstallmentPlan(prev.plan, next.plan).length === 0;
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
