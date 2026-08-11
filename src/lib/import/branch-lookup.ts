import type { AppData } from "../types";
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

/**
 * ÖNCELİK 4 (devam) — öğrenci CSV'sinde öğretmen artık e-posta ile değil,
 * AD ile eşleşir (yalnızca aynı tenant içindeki AKTİF öğretmenler arasında).
 * Aynı adda birden fazla (veya hiç) aktif öğretmen varsa asla tahmin
 * EDİLMEZ — satır açık bir hatayla reddedilir. Güvenilir/benzersiz eşleşme
 * için şablon yardımında "Ad Soyad (öğretmen kodu: tch_xxx)" biçiminde bir
 * id de kabul edilir — parantez içindeki id tam eşleşirse öncelik alır.
 */
export function resolveTeacherIdByName(
  data: AppData,
  value: string
): { ok: true; teacherId: string } | { ok: false; message: string } {
  const raw = value.trim();
  if (!raw) return { ok: false, message: "Öğretmen adı boş olamaz." };

  // "Ad Soyad (tch_abc123)" biçimindeki güvenilir/benzersiz id referansı.
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
      message: `"${value}" adında birden fazla aktif öğretmen var — satırı öğretmen kodu ile netleştirin (ör. "${matches[0]!.name} (${matches[0]!.id})").`,
    };
  }
  return { ok: true, teacherId: matches[0]!.id };
}

/**
 * Ders programı importu — öğrenci AD ile eşleşir (aynı tenant içindeki
 * AKTİF öğrenciler arasında), `resolveTeacherIdByName` ile birebir aynı
 * kural: belirsiz/bulunamayan eşleşme asla tahmin edilmez, "Ad Soyad
 * (öğrenci kodu)" ile netleştirilebilir.
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
      message: `"${value}" adında birden fazla aktif öğrenci var — satırı öğrenci kodu ile netleştirin (ör. "${matches[0]!.name} (${matches[0]!.id})").`,
    };
  }
  return { ok: true, studentId: matches[0]!.id };
}
