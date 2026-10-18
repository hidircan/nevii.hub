import type { Branch, Payment, SchoolSettings, StudentRef } from "./types";

/**
 * Tamamen ödenmiş kayıtlar dışında makbuz üretilmez — kısmi/bekleyen/gecikmiş
 * ödemeler için "tahsil edildi" ima eden bir belge göstermek yanıltıcı olur.
 * Payment veri modelinde kısmi tahsilatın ayrı bir makbuz akışı yok (bkz.
 * `markPaymentPaid`: her zaman tam tutarı öder), bu yüzden kapsam bilinçli
 * olarak yalnızca `status === "paid"` ile sınırlıdır.
 */
export function canViewReceipt(payment: Pick<Payment, "status">): boolean {
  return payment.status === "paid";
}

/** Makbuz aksiyonunun neden gösterilmediğini kullanıcıya açık şekilde anlatır. */
export function receiptIneligibleReason(payment: Pick<Payment, "status">): string | null {
  switch (payment.status) {
    case "paid":
      return null;
    case "partial":
      return "Bu ödeme kısmi olarak tahsil edilmiştir. Makbuz yalnızca tamamen ödenmiş kayıtlar için oluşturulur.";
    case "overdue":
      return "Bu ödeme gecikmiş ve henüz tahsil edilmemiştir. Makbuz oluşturmak için önce ödemeyi \"Ödendi\" olarak işaretleyin.";
    case "pending":
    default:
      return "Bu ödeme henüz tahsil edilmediği için makbuz oluşturulamaz.";
  }
}

/**
 * paymentId'den deterministik, okunabilir bir makbuz referansı türetir.
 * Basit bir FNV-1a benzeri hash — kriptografik değil, yalnızca aynı ödeme
 * için her zaman aynı referansı üretmek amacıyla kullanılır. Erişim kontrolü
 * bu referansa değil, oturum + tenant kapsamlı gerçek paymentId aramasına
 * dayanır; bu yüzden referansın tahmin edilebilir olması güvenlik riski
 * oluşturmaz.
 */
export function buildReceiptReference(paymentId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < paymentId.length; i++) {
    hash ^= paymentId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const code = (hash >>> 0).toString(36).toUpperCase().padStart(8, "0");
  return `MKB-${code}`;
}

export type ReceiptViewModel = {
  reference: string;
  institutionName: string;
  branchName?: string;
  branchContact?: string;
  studentName: string;
  parentLine?: string;
  description: string;
  amount: number;
  paymentDateIso: string;
  method?: string;
};

/**
 * Ödeme + öğrenci + kurum verisinden ekranda/basılıda gösterilecek makbuz
 * modelini kurar. Yalnızca veri modelinde gerçekten var olan alanları
 * kullanır — eksik alan için uydurma metin üretmez, alanı tamamen atlar.
 */
export function buildReceiptViewModel(
  payment: Payment,
  student: StudentRef,
  settings: Pick<SchoolSettings, "name">,
  branch: Branch | undefined
): ReceiptViewModel {
  const parentLine = student.parentName.trim()
    ? student.parentPhone.trim()
      ? `${student.parentName} · ${student.parentPhone}`
      : student.parentName
    : undefined;

  const branchContact = branch?.phone?.trim() || undefined;

  return {
    reference: buildReceiptReference(payment.id),
    institutionName: settings.name,
    branchName: branch?.name,
    branchContact,
    studentName: student.name,
    parentLine,
    description: payment.description,
    amount: payment.paidAmount,
    paymentDateIso: payment.paidAt ?? payment.dueDate,
    method: payment.method,
  };
}
