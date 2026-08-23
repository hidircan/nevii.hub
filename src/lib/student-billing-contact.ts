/**
 * Karma Öğrenci Portalı — "ödeme/iletişimde muhatap kim" sorusunun TEK
 * cevabı. `Student.accountResponsibility` iş kararını taşır
 * (PARENT_MANAGED | SELF_MANAGED); bu dosya o kararı somut bir iletişim
 * hedefine (isim + telefon) çevirir. Tahsilat/mesajlaşma call site'ları
 * `student.parentName`/`student.parentPhone`'u DOĞRUDAN okumak yerine
 * buradan geçmeli — SELF_MANAGED öğrenciler için veli alanları boş
 * olabilir, bu durumda öğrencinin kendi ad/telefonuna düşer.
 */
import type { Student } from "./types";

export type BillingContact = {
  /** "guardian" → veli alanları kullanıldı; "student" → SELF_MANAGED, öğrencinin kendi bilgisi. */
  kind: "guardian" | "student";
  name: string;
  phone: string;
};

export function resolveStudentBillingContact(student: Student): BillingContact {
  const responsibility = student.accountResponsibility ?? "PARENT_MANAGED";
  const hasGuardianContact = Boolean(student.parentPhone || student.parentName);

  if (responsibility === "SELF_MANAGED" || !hasGuardianContact) {
    return { kind: "student", name: student.name, phone: student.phone };
  }
  return { kind: "guardian", name: student.parentName, phone: student.parentPhone };
}
