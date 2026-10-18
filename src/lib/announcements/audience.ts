/**
 * EPIC 5 (IMPLEMENTATION_PLAN.md) — duyuru hedef kitlesi eşleştirmesi.
 * Saf fonksiyonlar (I/O yok) — SUNUCU tarafında çağrılır, asla client'a
 * hedef-dışı duyuru verisi gönderilmez. Bu dosya en hataya açık mantığı
 * izole tutar; testler (announcements-audience.test.ts) her audienceType
 * için "hedefte olan görür, olmayan görmez" matrisini doğrular.
 */

import type { Announcement, AudienceRule, StudentRef, StudentType, Teacher } from "../types";
import { effectiveStudentTypes } from "../student-types";

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
  students: StudentRef[];
  teachers: Teacher[];
};

function matchesRule(rule: AudienceRule, recipient: AnnouncementRecipient, context: AudienceContext): boolean {
  switch (rule.audienceType) {
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
      const ref = rule.audienceRef as { branchId?: string } | undefined;
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
      const ref = rule.audienceRef as { studentType?: string } | undefined;
      if (!ref?.studentType) return false;
      if (recipient.role !== "STUDENT") return false;
      // Faz 1B — öğrenci birden fazla türe sahip olabilir; hedeflenen tür
      // ATANMIŞ türlerden HERHANGİ biriyse eşleşir (exact-match yerine includes).
      const student = context.students.find((s) => s.id === recipient.studentId);
      return !!student && effectiveStudentTypes(student).includes(ref.studentType as StudentType);
    }
    case "instrument": {
      // Faz 4 — hem bu enstrümanı çalan öğrenciler HEM bu enstrümanı
      // öğreten öğretmenler hedefte (`branch` segmentiyle aynı iki-rol deseni).
      const ref = rule.audienceRef as { instrument?: string[] } | undefined;
      const wanted = ref?.instrument ?? [];
      if (wanted.length === 0) return false;
      if (recipient.role === "TEACHER") {
        const teacher = context.teachers.find((t) => t.id === recipient.teacherId);
        return !!teacher && teacher.instruments.some((i) => wanted.includes(i));
      }
      if (recipient.role === "STUDENT") {
        const student = context.students.find((s) => s.id === recipient.studentId);
        return !!student && student.instruments.some((i) => wanted.includes(i));
      }
      return false;
    }
    case "selected": {
      const ref = rule.audienceRef as { userIds?: string[] } | undefined;
      return (ref?.userIds ?? []).includes(recipient.userId);
    }
    default:
      return false;
  }
}

export function matchesAudience(
  announcement: Pick<Announcement, "audienceType" | "audienceRef" | "rules">,
  recipient: AnnouncementRecipient,
  context: AudienceContext
): boolean {
  const rules: AudienceRule[] =
    announcement.rules && announcement.rules.length > 0
      ? announcement.rules
      : [{ audienceType: announcement.audienceType, audienceRef: announcement.audienceRef }];
  return rules.some((rule) => matchesRule(rule, recipient, context));
}

/**
 * Faz 4 — PUSH: yayınlanma anında hedef kitleyi tek seferde çözer.
 * `candidates` çağıran tarafça (I/O gerektiren bir adım — bu dosya saf
 * kalır) üretilir; her GERÇEK kullanıcı hesabı için TEK aday (guardian'lar
 * birden fazla öğrenciye bağlıysa öğrenci başına bir aday satırı olabilir,
 * bu yüzden eşleşenler userId'ye göre TEKİLLEŞTİRİLİR — bir kullanıcı iki
 * ayrı kuraldan veya iki ayrı öğrenciden eşleşse bile TEK bildirim alır).
 */
export function resolveAudienceRecipients(
  announcement: Pick<Announcement, "audienceType" | "audienceRef" | "rules">,
  candidates: AnnouncementRecipient[],
  context: AudienceContext
): AnnouncementRecipient[] {
  const seen = new Set<string>();
  const result: AnnouncementRecipient[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.userId)) continue;
    if (!matchesAudience(announcement, candidate, context)) continue;
    seen.add(candidate.userId);
    result.push(candidate);
  }
  return result;
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
