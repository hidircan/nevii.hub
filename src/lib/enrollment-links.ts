/**
 * 2026-10-09 — branş kaydı bağları (sunucu tarafı; I/O yapar). Saf kurallar student-enrollments.ts'te.
 *
 * Değişmez kural: bağsız (NULL) eski kayıtlar yalnız öğrencinin TEK branş kaydı varken o branşa bağlanır — o anda
 * belirsizlik yoktur. Bu yüzden ikinci branş eklenmeden ÖNCE mevcut tek branşa bağlanırlar. Çok branşlı eski
 * öğrencide bağsız kayıt TAHMİNLE bağlanmaz; "Branş belirtilmemiş" kalır ve "Branşa bağla" ile açıkça bağlanır.
 */
import { createHash } from "crypto";
import type { Student, StudentEnrollment, Teacher } from "./types";
import { effectiveEnrollments, primaryFieldsFromEnrollments } from "./student-enrollments";

/** Türetilmiş (eski) eğitimin kalıcı kimliği — öğrenci + enstrümandan DETERMİNİSTİK (tekrar çalıştırmada aynı). */
export function materializedEnrollmentId(studentId: string, instrument: string): string {
  return `enr_${createHash("sha256").update(`${studentId}:${instrument}`).digest("hex").slice(0, 20)}`;
}

/** Bağsız kayıtları (sözleşme + ödeme + enstrümanı eşleşen ders/seri) tek branş kaydına bağlar; sayıları döner. */
export async function linkStudentHistoryToEnrollment(
  tenantId: string,
  studentId: string,
  enrollment: Pick<StudentEnrollment, "id" | "instrument">
): Promise<{ contracts: number; payments: number; lessons: number; series: number }> {
  const [{ linkRecordsToEnrollment }, { linkUnassignedContracts }] = await Promise.all([import("./store"), import("./contracts")]);
  const contracts = await linkUnassignedContracts(tenantId, studentId, enrollment.id);
  const rows = await linkRecordsToEnrollment({
    studentId,
    enrollmentId: enrollment.id,
    instrument: enrollment.instrument,
    scope: "student",
  });
  // Bağlanan sözleşmelerin serileri/dersleri enstrümandan bağımsız olarak da sözleşmeyi izler.
  if (contracts.length > 0) {
    await linkRecordsToEnrollment({ studentId, enrollmentId: enrollment.id, contractIds: contracts });
  }
  return { contracts: contracts.length, ...rows };
}

/**
 * Branş kayıtlarını kalıcı yapar (yoksa; kimlikler deterministik). Tek branşlı öğrencide bağsız eski kayıtlar o
 * branşa bağlanır. Öğrencinin eski tekil alanları değişmez (aynı değerlerden türetilir).
 */
export async function ensurePersistedEnrollments(
  tenantId: string,
  student: Student,
  teachers: Pick<Teacher, "id" | "instruments">[]
): Promise<StudentEnrollment[]> {
  if (student.enrollments && student.enrollments.length > 0) return student.enrollments;
  const derived = effectiveEnrollments(student, teachers);
  if (derived.length === 0) return [];
  const list: StudentEnrollment[] = derived.map(({ legacy, ...rest }) => {
    void legacy;
    return { ...rest, id: materializedEnrollmentId(student.id, rest.instrument) };
  });
  const { updateStudentProfile } = await import("./store");
  await updateStudentProfile(student.id, { enrollments: list, ...primaryFieldsFromEnrollments(list, student) });
  if (list.length === 1) await linkStudentHistoryToEnrollment(tenantId, student.id, list[0]!);
  return list;
}
