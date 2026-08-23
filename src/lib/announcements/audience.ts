/**
 * EPIC 5 (IMPLEMENTATION_PLAN.md) — duyuru hedef kitlesi eşleştirmesi.
 * Saf fonksiyonlar (I/O yok) — SUNUCU tarafında çağrılır, asla client'a
 * hedef-dışı duyuru verisi gönderilmez. Bu dosya en hataya açık mantığı
 * izole tutar; testler (announcements-audience.test.ts) her audienceType
 * için "hedefte olan görür, olmayan görmez" matrisini doğrular.
 */

import type { Announcement, Student, Teacher } from "../types";

export type AnnouncementRecipient = {
  role: string;
  userId: string;
  teacherId?: string;
  studentId?: string;
  /**
   * Karma Öğrenci Portalı — veli/öğrenci ayrımı artık rol değil,
   * StudentPortalAccess.accessType. "parents"/"students" audienceType
   * eşleştirmesi BUNA göre yapılır (role tek başına yeterli değil, çünkü
   * ikisi de artık "STUDENT").
   */
  accessType?: "GUARDIAN" | "SELF";
};

export type AudienceContext = {
  students: Student[];
  teachers: Teacher[];
};

export function matchesAudience(
  announcement: Pick<Announcement, "audienceType" | "audienceRef">,
  recipient: AnnouncementRecipient,
  context: AudienceContext
): boolean {
  switch (announcement.audienceType) {
    case "all":
      return true;
    case "teachers":
      return recipient.role === "TEACHER";
    case "parents":
      // Karma Öğrenci Portalı — "veli" artık bir rol değil, StudentPortalAccess
      // accessType=GUARDIAN. role tek başına ARTIK YETERSİZ (hem veli hem
      // öğrenci "STUDENT").
      return recipient.role === "STUDENT" && recipient.accessType === "GUARDIAN";
    case "students":
      // accessType=SELF → öğrencinin kendisi. accessType hiç çözülemediyse
      // (ör. eski/legacy bir çağıran) fail-open yerine role'e düşer — en
      // azından TEACHER/admin'e sızdırmaz.
      return recipient.role === "STUDENT" && recipient.accessType !== "GUARDIAN";
    case "branch": {
      const ref = announcement.audienceRef as { branchId?: string } | undefined;
      if (!ref?.branchId) return false;
      if (recipient.role === "TEACHER") {
        return context.teachers.find((t) => t.id === recipient.teacherId)?.branchId === ref.branchId;
      }
      if (recipient.role === "STUDENT") {
        return context.students.find((s) => s.id === recipient.studentId)?.branchId === ref.branchId;
      }
      return false;
    }
    case "studentType": {
      const ref = announcement.audienceRef as { studentType?: string } | undefined;
      if (!ref?.studentType) return false;
      if (recipient.role !== "STUDENT") return false;
      return (
        context.students.find((s) => s.id === recipient.studentId)?.studentType === ref.studentType
      );
    }
    case "selected": {
      const ref = announcement.audienceRef as { userIds?: string[] } | undefined;
      return (ref?.userIds ?? []).includes(recipient.userId);
    }
    default:
      return false;
  }
}

/** Taslak/arşiv asla portale sızmaz; yayın penceresi dışındaki de gizlenir. */
export function isVisibleNow(
  announcement: Pick<Announcement, "status" | "publishAt" | "expireAt">,
  now: Date = new Date()
): boolean {
  if (announcement.status !== "published") return false;
  if (announcement.publishAt && new Date(announcement.publishAt) > now) return false;
  if (announcement.expireAt && new Date(announcement.expireAt) < now) return false;
  return true;
}
