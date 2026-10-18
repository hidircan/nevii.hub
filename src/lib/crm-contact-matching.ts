/**
 * Faz 11 — telefon numarasından kişi eşleştirme. Saf fonksiyonlar (I/O yok),
 * `data.students`/`data.teachers` çağıran tarafça (tools.ts) sağlanır.
 * Birden fazla eşleşme varsa "belirsiz" — otomatik atama YAPILMAZ, manuel
 * çözüme düşer (`assignCallContactTool`/`assignMessageContactTool`).
 */
import type { StudentRef, Teacher, CrmContactType } from "./types";

export type ContactMatch = { contactType: CrmContactType; contactId: string; label: string };
export type MatchContactResult =
  | { status: "matched"; match: ContactMatch }
  | { status: "ambiguous"; candidates: ContactMatch[] }
  | { status: "none" };

/** Yalnızca rakamları bırakır — biçimlendirme farklarını (boşluk/tire/parantez) yok sayar. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function matchContactByPhone(phone: string, students: StudentRef[], teachers: Teacher[]): MatchContactResult {
  const normalized = normalizePhone(phone);
  if (!normalized) return { status: "none" };

  const candidates: ContactMatch[] = [];
  for (const s of students) {
    if (s.phone && normalizePhone(s.phone) === normalized) {
      candidates.push({ contactType: "student", contactId: s.id, label: `${s.name} (öğrenci)` });
    }
    if (s.parentPhone && normalizePhone(s.parentPhone) === normalized) {
      candidates.push({ contactType: "parent", contactId: s.id, label: `${s.name} (veli)` });
    }
  }
  for (const t of teachers) {
    if (t.phone && normalizePhone(t.phone) === normalized) {
      // Faz 11'in kapsamı student/parent/lead — öğretmen eşleşmesi "lead" olarak işaretlenmez,
      // aday listesine hiç eklenmez (CRM'in hedef kitlesi veli/öğrenci/potansiyel kayıt).
      continue;
    }
  }

  if (candidates.length === 1) return { status: "matched", match: candidates[0]! };
  if (candidates.length > 1) return { status: "ambiguous", candidates };
  return { status: "none" };
}
