/**
 * 2026-10-06 — Telafi Merkezi filtreleri (saf; I/O yok). Sayfa (server component) ve istemci filtre çubuğu
 * aynı kuralı kullanır.
 *
 * Anlam (hepsi AND, sayfalama/sayaçlardan ÖNCE uygulanır):
 *  - öğrenci  → talebin öğrencisi (`studentId`, kimlikle; ad metniyle değil)
 *  - şube     → talebin KAYNAK şubesi (`branchId`)
 *  - öğretmen → talebin kendi öğretmeni (`teacherId`); önerilen yedek öğretmen (`suggestedSlots[].teacherId`) DEĞİL
 *
 * Seçenek listeleri yalnız aktif kişileri içerir (öğrenci: `isActiveStudent`; öğretmen: `active` + silinmemiş),
 * ama filtre seçilmediğinde pasif kişilerin geçmiş talepleri GİZLENMEZ — aktiflik yalnız seçilebilirliği belirler.
 * URL'deki kimlik kapsamdaki veride yoksa (başka kurum, silinmiş satır, uydurma değer) yok sayılır.
 */
import { isActiveStudent } from "./payment-scope";
import type { MakeupRequest, Student, Teacher } from "./types";

export type MakeupFilters = { studentId: string; branchId: string; teacherId: string };

export const EMPTY_MAKEUP_FILTERS: MakeupFilters = { studentId: "", branchId: "", teacherId: "" };

export type MakeupFilterStudent = Pick<Student, "id" | "name" | "branchId" | "active" | "deletedAt" | "enrollments">;
export type MakeupFilterTeacher = Pick<Teacher, "id" | "name" | "branchId" | "branchIds" | "active" | "deletedAt">;

export function isActiveTeacher(teacher: Pick<Teacher, "active" | "deletedAt"> | undefined): boolean {
  return Boolean(teacher && teacher.active !== false && !teacher.deletedAt);
}

/** URL parametrelerini kapsamdaki veriye göre doğrular; bilinmeyen kimlik boş filtreye düşer. */
export function parseMakeupFilters(
  raw: { ogrenci?: string; sube?: string; ogretmen?: string },
  scope: { students: Pick<Student, "id">[]; teachers: Pick<Teacher, "id">[]; branchIds: string[] }
): MakeupFilters {
  const pick = (value: string | undefined, valid: (v: string) => boolean) => {
    const v = (value ?? "").trim();
    return v && valid(v) ? v : "";
  };
  return {
    studentId: pick(raw.ogrenci, (v) => scope.students.some((s) => s.id === v)),
    branchId: pick(raw.sube, (v) => scope.branchIds.includes(v)),
    teacherId: pick(raw.ogretmen, (v) => scope.teachers.some((t) => t.id === v)),
  };
}

export function filterMakeupRequests<R extends Pick<MakeupRequest, "studentId" | "branchId" | "teacherId">>(
  requests: R[],
  filters: MakeupFilters
): R[] {
  return requests.filter(
    (r) =>
      (!filters.studentId || r.studentId === filters.studentId) &&
      (!filters.branchId || r.branchId === filters.branchId) &&
      (!filters.teacherId || r.teacherId === filters.teacherId)
  );
}

/** Filtre seçeneği — istemciye yalnız kimlik, ad, şube(ler) gider (telefon/e-posta/veli bilgisi YOK). */
export type MakeupFilterOption = { id: string; name: string; branchIds: string[] };

export function studentBranchIds(student: Pick<Student, "branchId" | "enrollments">): string[] {
  return [...new Set([student.branchId, ...(student.enrollments ?? []).map((e) => e.branchId ?? "")].filter(Boolean))];
}

export function teacherBranchIds(teacher: Pick<Teacher, "branchId" | "branchIds">): string[] {
  return [...new Set([teacher.branchId, ...(teacher.branchIds ?? [])].filter(Boolean))];
}

/** Seçilebilir öğrenciler: yalnız aktif (`isActiveStudent`), Türkçe ada göre sıralı. */
export function makeupStudentOptions(students: MakeupFilterStudent[]): MakeupFilterOption[] {
  return students
    .filter(isActiveStudent)
    .map((s) => ({ id: s.id, name: s.name, branchIds: studentBranchIds(s) }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

/** Seçilebilir öğretmenler: yalnız aktif + silinmemiş; çok şubeli öğretmen tüm şubelerinde görünür. */
export function makeupTeacherOptions(teachers: MakeupFilterTeacher[]): MakeupFilterOption[] {
  return teachers
    .filter(isActiveTeacher)
    .map((t) => ({ id: t.id, name: t.name, branchIds: teacherBranchIds(t) }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

/** Şube seçiliyse yalnız o şubeye ait seçenekler. */
export function optionsForBranch<O extends Pick<MakeupFilterOption, "branchIds">>(options: O[], branchId: string): O[] {
  return branchId ? options.filter((o) => o.branchIds.includes(branchId)) : options;
}

/**
 * Şube değişince o şubeyle uyumsuz öğrenci/öğretmen seçimini temizler. Listeler seçili kişilerin şubelerini
 * taşır (pasif seçili öğrenci seçeneklerde olmadığı için çağıran ayrıca ekler); bilinmeyen kişi temizlenir.
 */
type BranchPerson = Pick<MakeupFilterOption, "id" | "branchIds">;
export function filtersForBranchChange(
  current: MakeupFilters,
  nextBranchId: string,
  students: BranchPerson[],
  teachers: BranchPerson[]
): MakeupFilters {
  const keep = (id: string, people: BranchPerson[]) => {
    if (!id) return "";
    const person = people.find((p) => p.id === id);
    return person && (!nextBranchId || person.branchIds.includes(nextBranchId)) ? id : "";
  };
  return {
    branchId: nextBranchId,
    studentId: keep(current.studentId, students),
    teacherId: keep(current.teacherId, teachers),
  };
}

/** Filtre + durum sekmesi + sayfa → URL. Filtre değişince çağıran `sayfa`yı vermez (1'e döner). */
export function makeupFilterHref(params: Partial<MakeupFilters> & { durum?: string; q?: string; sayfa?: number }): string {
  const sp = new URLSearchParams();
  if (params.durum && params.durum !== "tumu") sp.set("durum", params.durum);
  if (params.studentId) sp.set("ogrenci", params.studentId);
  if (params.branchId) sp.set("sube", params.branchId);
  if (params.teacherId) sp.set("ogretmen", params.teacherId);
  if (params.q) sp.set("q", params.q);
  if (params.sayfa && params.sayfa > 1) sp.set("sayfa", String(params.sayfa));
  const qs = sp.toString();
  return qs ? `/panel/telafi?${qs}` : "/panel/telafi";
}
