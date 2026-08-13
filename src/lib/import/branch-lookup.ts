import type { AppData, Student, Teacher } from "../types";
import { normalizeMatchKey as normalizeKey } from "../normalize";

/**
 * Şube eşlemesi kısa ad veya ada göre yapılır. Belirsiz veya bulunamayan
 * eşleşme asla tahmin edilmez — açık bir hata döner.
 */
export function resolveBranchId(
  data: AppData,
  value: string
): { ok: true; branchId: string } | { ok: false; message: string } {
  const v = normalizeKey(value);
  if (!v) return { ok: false, message: "Şube bilgisi boş olamaz." };
  const matches = data.settings.branches.filter(
    (b) => normalizeKey(b.shortName) === v || normalizeKey(b.name) === v
  );
  if (matches.length === 0) {
    return { ok: false, message: `"${value}" adında/kısa adında bir şube bulunamadı.` };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      message: `"${value}" birden fazla şubeyle eşleşiyor — lütfen tam şube adını kullanın.`,
    };
  }
  return { ok: true, branchId: matches[0].id };
}

/**
 * Öğretmen eşlemesi yalnızca e-postaya göre yapılır. Belirsiz/bulunamayan
 * eşleşme tahmin edilmez.
 */
export function resolveTeacherIdByEmail(
  data: AppData,
  value: string
): { ok: true; teacherId: string } | { ok: false; message: string } {
  const v = normalizeKey(value);
  if (!v) return { ok: false, message: "Öğretmen e-postası boş olamaz." };
  const matches = data.teachers.filter((t) => normalizeKey(t.email) === v);
  if (matches.length === 0) {
    return { ok: false, message: `"${value}" e-postalı bir öğretmen bulunamadı.` };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      message: `"${value}" e-postası birden fazla öğretmenle eşleşiyor.`,
    };
  }
  return { ok: true, teacherId: matches[0].id };
}

function branchLabel(data: AppData, branchId: string): string {
  const b = data.settings.branches.find((x) => x.id === branchId);
  return b?.shortName || b?.name || branchId;
}

function phoneLast4(phone: string | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "—";
  return digits.slice(-4);
}

/** Çoklu eşleşmede kopyalanabilir kod + ayırt edici güvenli alanlar. */
export function formatStudentDisambiguation(data: AppData, students: Student[]): string {
  return students
    .map((s) => {
      const branch = branchLabel(data, s.branchId);
      const parent = s.parentName?.trim() || "veli yok";
      const tail = phoneLast4(s.parentPhone);
      return `"${s.name}" kod=${s.id} · şube=${branch} · veli=${parent} · tel…${tail}`;
    })
    .join("; ");
}

export function formatTeacherDisambiguation(data: AppData, teachers: Teacher[]): string {
  return teachers
    .map((t) => {
      const branch = branchLabel(data, t.branchId);
      return `"${t.name}" kod=${t.id} · şube=${branch} · e-posta=${t.email || "—"}`;
    })
    .join("; ");
}

/**
 * Stabil öğretmen kodu (Teacher.id). Aktif kayıt zorunlu.
 * Opsiyonel ad ile doğrulama: ad doluysa ve eşleşmezse hard error.
 */
export function resolveTeacherIdByCode(
  data: AppData,
  code: string,
  nameForVerify?: string
): { ok: true; teacherId: string } | { ok: false; message: string } {
  const id = code.trim();
  if (!id) return { ok: false, message: "Öğretmen kodu boş olamaz." };
  const teacher = data.teachers.find((t) => t.id === id);
  if (!teacher) {
    return { ok: false, message: `Öğretmen kodu bulunamadı: "${id}".` };
  }
  if (!teacher.active) {
    return { ok: false, message: `Öğretmen kodu arşivli/pasif: "${id}" (${teacher.name}).` };
  }
  const name = (nameForVerify ?? "").trim();
  if (name) {
    const nameOnly = name.replace(/\([^()]*\)\s*$/, "").trim();
    if (normalizeKey(nameOnly) !== normalizeKey(teacher.name)) {
      return {
        ok: false,
        message: `Öğretmen kodu "${id}" (${teacher.name}) ile ad "${name}" çelişiyor — satır reddedildi.`,
      };
    }
  }
  return { ok: true, teacherId: teacher.id };
}

/**
 * Stabil öğrenci kodu (Student.id). Aktif kayıt zorunlu.
 * Opsiyonel ad ile doğrulama: ad doluysa ve eşleşmezse hard error.
 */
export function resolveStudentIdByCode(
  data: AppData,
  code: string,
  nameForVerify?: string
): { ok: true; studentId: string } | { ok: false; message: string } {
  const id = code.trim();
  if (!id) return { ok: false, message: "Öğrenci kodu boş olamaz." };
  const student = data.students.find((s) => s.id === id);
  if (!student) {
    return { ok: false, message: `Öğrenci kodu bulunamadı: "${id}".` };
  }
  if (!student.active) {
    return { ok: false, message: `Öğrenci kodu arşivli/pasif: "${id}" (${student.name}).` };
  }
  const name = (nameForVerify ?? "").trim();
  if (name) {
    const nameOnly = name.replace(/\([^()]*\)\s*$/, "").trim();
    if (normalizeKey(nameOnly) !== normalizeKey(student.name)) {
      return {
        ok: false,
        message: `Öğrenci kodu "${id}" (${student.name}) ile ad "${name}" çelişiyor — satır reddedildi.`,
      };
    }
  }
  return { ok: true, studentId: student.id };
}

/**
 * Öğretmen AD ile eşleşir (yalnızca AKTİF). "Ad Soyad (kod)" parantez id
 * önceliklidir. Birden fazla eşleşmede tahmin yok — kod listesi verilir.
 */
export function resolveTeacherIdByName(
  data: AppData,
  value: string
): { ok: true; teacherId: string } | { ok: false; message: string } {
  const raw = value.trim();
  if (!raw) return { ok: false, message: "Öğretmen adı boş olamaz." };

  const idMatch = raw.match(/\(([^()]+)\)\s*$/);
  if (idMatch) {
    const byId = data.teachers.find((t) => t.id === idMatch[1]!.trim() && t.active);
    if (byId) return { ok: true, teacherId: byId.id };
  }

  const v = normalizeKey(raw.replace(/\([^()]*\)\s*$/, ""));
  const matches = data.teachers.filter((t) => t.active && normalizeKey(t.name) === v);
  if (matches.length === 0) {
    return { ok: false, message: `"${value}" adında aktif bir öğretmen bulunamadı.` };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      message: `"${value}" adında birden fazla aktif öğretmen var — ogretmen_kodu kullanın. Eşleşmeler: ${formatTeacherDisambiguation(data, matches)}`,
    };
  }
  return { ok: true, teacherId: matches[0]!.id };
}

/**
 * Öğrenci AD ile eşleşir (yalnızca AKTİF). "Ad Soyad (kod)" parantez id
 * önceliklidir. Birden fazla eşleşmede tahmin yok — kod listesi verilir.
 */
export function resolveStudentIdByName(
  data: AppData,
  value: string
): { ok: true; studentId: string } | { ok: false; message: string } {
  const raw = value.trim();
  if (!raw) return { ok: false, message: "Öğrenci adı boş olamaz." };

  const idMatch = raw.match(/\(([^()]+)\)\s*$/);
  if (idMatch) {
    const byId = data.students.find((s) => s.id === idMatch[1]!.trim() && s.active);
    if (byId) return { ok: true, studentId: byId.id };
  }

  const v = normalizeKey(raw.replace(/\([^()]*\)\s*$/, ""));
  const matches = data.students.filter((s) => s.active && normalizeKey(s.name) === v);
  if (matches.length === 0) {
    return { ok: false, message: `"${value}" adında aktif bir öğrenci bulunamadı.` };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      message: `"${value}" adında birden fazla aktif öğrenci var — ogrenci_kodu kullanın. Eşleşmeler: ${formatStudentDisambiguation(data, matches)}`,
    };
  }
  return { ok: true, studentId: matches[0]!.id };
}

/**
 * Ders programı satırı: kod sütunu doluysa kod öncelikli; ad doğrulama.
 * Kod boşsa ad çözümlemesi (eski CSV uyumu).
 */
export function resolveStudentForScheduleRow(
  data: AppData,
  nameValue: string,
  codeValue: string
): { ok: true; studentId: string } | { ok: false; message: string } {
  const code = (codeValue ?? "").trim();
  const name = (nameValue ?? "").trim();
  if (code) return resolveStudentIdByCode(data, code, name || undefined);
  if (!name) return { ok: false, message: "Öğrenci adı veya ogrenci_kodu zorunludur." };
  return resolveStudentIdByName(data, name);
}

export function resolveTeacherForScheduleRow(
  data: AppData,
  nameValue: string,
  codeValue: string
): { ok: true; teacherId: string } | { ok: false; message: string } {
  const code = (codeValue ?? "").trim();
  const name = (nameValue ?? "").trim();
  if (code) return resolveTeacherIdByCode(data, code, name || undefined);
  if (!name) return { ok: false, message: "Öğretmen adı veya ogretmen_kodu zorunludur." };
  return resolveTeacherIdByName(data, name);
}
