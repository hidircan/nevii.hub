import type { Homework } from "../types/api";

export type HomeworkBucket = "pending" | "upcoming" | "past";

/**
 * Ödev listelerini üç ayrık sekmeye böler: teslim edilmemiş VE süresi geçmiş
 * olanlar "Bekleyen" (en acil), süresi henüz gelmemiş olanlar "Yaklaşan",
 * geri kalan her şey (teslim edilmiş/incelenmiş veya süresi geçmiş ama işlenmiş) "Geçmiş".
 */
export function homeworkBucket(h: Homework, now = new Date()): HomeworkBucket {
  const due = h.dueDate ? new Date(h.dueDate).getTime() : null;
  const isFuture = due !== null && due >= now.getTime();
  if (h.status === "PENDING" && due !== null && !isFuture) return "pending";
  if (isFuture || due === null) return "upcoming";
  return "past";
}

export type HomeworkFilter = HomeworkBucket | "active";

/**
 * "Aktif" filtresi/varsayılan sekme: öğretmenin hâlâ ilgilenmesi gereken her ödev —
 * süresi geçmiş-teslim edilmemiş ("pending") + süresi henüz gelmemiş-teslim edilmemiş
 * ("upcoming"). Sadece "pending"i varsayılan yapmak, henüz vadesi gelmemiş açık ödevleri
 * gizlerdi; sadece "upcoming" yapmak da geciken ödevleri gizlerdi — ikisi birlikte gerekir.
 */
export function isActiveHomework(h: Homework, now = new Date()): boolean {
  const bucket = homeworkBucket(h, now);
  return bucket === "pending" || bucket === "upcoming";
}

export function matchesHomeworkFilter(h: Homework, filter: HomeworkFilter, now = new Date()): boolean {
  if (filter === "active") return isActiveHomework(h, now);
  return homeworkBucket(h, now) === filter;
}

export type StudentFilterOption = { id: string; name: string };

/**
 * Ödev filtresindeki öğrenci listesi öğretmenin TÜM yetkili öğrencilerinden gelir
 * (ders listesi), sadece o an dönen ödevlerin içinde geçen öğrencilerden değil —
 * aksi halde henüz ödevi olmayan bir öğrenci filtrede hiç görünmez.
 */
export function buildStudentFilterOptions(students: Array<{ id: string; name: string }>): StudentFilterOption[] {
  return [...students].sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

/** İsme göre değil kimliğe göre eşleştirir — aynı isimli iki öğrenciyi karıştırmaz. */
export function matchesStudentFilter(h: Homework, studentId: string | null): boolean {
  return !studentId || h.studentId === studentId;
}
