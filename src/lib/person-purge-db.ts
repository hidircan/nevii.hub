/**
 * Kalıcı silme — STORE_MODE=db yükleyici + yürütücü. Önizleme `loadPurgeSnapshotDb(prisma)` ile, silme aynı
 * yükleyiciyi transaction istemcisiyle (`tx`) çağırır; plan `person-purge.ts`'teki saf fonksiyondan gelir.
 *
 * Silme: tek `$transaction`, kişi başına `pg_advisory_xact_lock` (iki eşzamanlı silme sıralanır), anlık görüntü
 * kilit altında yeniden okunur ve parmak izi önizlemeyle aynı değilse hiçbir şey yazılmaz. Her `deleteMany`
 * beklenen satır sayısını doğrular; sayı tutmazsa veya araya giren bir kayıt FK'ye takılırsa (P2003) tüm
 * transaction geri alınır → PurgeConflictError. FK'ler RESTRICT kalır; CASCADE'e güvenilmez.
 * Harici sistem yok: evrak/fotoğraf dosyaları DB satırında (fileData) — DB commit'i tek doğruluk noktasıdır.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { requireTenantId } from "./tenant-context";
import {
  PurgeConflictError,
  STUDENT_PII_CLEAR,
  TEACHER_PII_CLEAR,
  bucketIds,
  closedAccountEmail,
  planPersonPurge,
  type PurgeAccountRow,
  type PurgeKind,
  type PurgePlan,
  type PurgeSnapshot,
  type PurgeTableKey,
  type StudentPurgeSnapshot,
  type TeacherPurgeSnapshot,
} from "./person-purge";

type Db = PrismaClient | Prisma.TransactionClient;
const iso = (d: Date | null | undefined) => d?.toISOString();
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

async function loadStudentSnapshot(db: Db, tenantId: string, studentId: string, nowIso: string): Promise<StudentPurgeSnapshot | null> {
  const where = { tenantId, studentId };
  const student = await db.student.findFirst({
    where: { id: studentId, tenantId },
    select: { id: true, name: true, displayId: true, active: true, deletedAt: true, purgedAt: true },
  });
  if (!student) return null;
  const [lessons, attendances, series, makeups, payments, contracts, checkouts, followUps, documents, clubMemberships, portal] =
    await Promise.all([
      db.lesson.findMany({ where, select: { id: true, studentId: true, teacherId: true, startAt: true, status: true, seriesId: true, clubSessionId: true } }),
      db.attendance.findMany({ where, select: { id: true, lessonId: true } }),
      db.lessonSeries.findMany({ where, select: { id: true } }),
      db.makeupRequest.findMany({ where, select: { id: true, attendanceId: true, sourceLessonId: true, confirmedLessonId: true } }),
      db.payment.findMany({ where, select: { id: true, amount: true, paidAmount: true, status: true, contractId: true, lessonId: true, clubMembershipId: true } }),
      db.studentContract.findMany({ where, select: { id: true, status: true, signedAt: true, documentInstanceId: true } }),
      db.paymentCheckoutAttempt.findMany({ where, select: { id: true, paymentId: true, status: true, expiresAt: true } }),
      db.paymentFollowUpCase.findMany({ where, select: { id: true, paymentId: true } }),
      db.documentInstance.findMany({ where, select: { id: true } }),
      db.clubMembership.findMany({ where, select: { id: true } }),
      db.studentPortalAccess.findMany({ where, select: { id: true, userId: true } }),
    ]);
  const teacherIds = [...new Set(lessons.map((l) => l.teacherId))];
  const [payouts, teachers] = await Promise.all([
    db.teacherPayout.findMany({
      where: { tenantId, teacherId: { in: teacherIds } },
      select: { id: true, teacherId: true, periodStart: true, periodEnd: true, status: true },
    }),
    db.teacher.findMany({ where: { tenantId, id: { in: teacherIds } }, select: { id: true, name: true } }),
  ]);
  const [feedbackInvites, lessonAssessments, periodicAssessments, homeworkSubmissions, homework, teacherFeedback, studentFeedback, curriculumTopics, socialMediaConsents, kvkkConsents, riskLogs, notifications, profilePhotos, communicationMessages] =
    await Promise.all([
      db.feedbackInvite.findMany({ where, select: { id: true } }),
      db.lessonAssessment.findMany({ where, select: { id: true } }),
      db.periodicAssessment.findMany({ where, select: { id: true } }),
      db.homeworkSubmission.findMany({ where, select: { id: true } }),
      db.homework.findMany({ where, select: { id: true } }),
      db.teacherFeedback.findMany({ where, select: { id: true } }),
      db.studentFeedback.findMany({ where, select: { id: true } }),
      db.studentCurriculumTopic.findMany({ where, select: { id: true } }),
      db.socialMediaConsent.findMany({ where, select: { id: true } }),
      db.kvkkConsent.findMany({ where: { tenantId, subjectType: "student", subjectId: studentId }, select: { id: true } }),
      db.studentAttendanceRiskLog.findMany({ where, select: { id: true } }),
      db.notification.findMany({ where: { tenantId, targetStudentId: studentId }, select: { id: true } }),
      db.profilePhoto.findMany({ where: { tenantId, ownerType: "student", ownerId: studentId }, select: { id: true } }),
      db.communicationMessage.findMany({ where: { tenantId, recipientType: { in: ["PARENT", "STUDENT"] }, recipientId: studentId }, select: { id: true } }),
    ]);
  const [tasks, clubApplications, trialConversions] = await Promise.all([
    db.task.findMany({ where: taskWhere(tenantId, "student", studentId), select: { id: true } }),
    db.clubApplication.findMany({ where, select: { id: true } }),
    db.trialLesson.findMany({ where: { tenantId, convertedStudentId: studentId }, select: { id: true } }),
  ]);
  const accounts = await loadAccounts(db, tenantId, { studentId, portalUserIds: portal.map((p) => p.userId) });
  return {
    kind: "student",
    person: { id: student.id, name: student.name, displayId: student.displayId ?? undefined, active: student.active, deletedAt: iso(student.deletedAt), purgedAt: iso(student.purgedAt) },
    lessons: lessons.map((l) => ({ ...l, startAt: l.startAt.toISOString(), seriesId: l.seriesId ?? undefined, clubSessionId: l.clubSessionId ?? undefined })),
    attendances,
    series,
    makeups: makeups.map((m) => ({ ...m, confirmedLessonId: m.confirmedLessonId ?? undefined })),
    payments: payments.map((p) => ({ ...p, contractId: p.contractId ?? undefined, lessonId: p.lessonId ?? undefined, clubMembershipId: p.clubMembershipId ?? undefined })),
    contracts: contracts.map((c) => ({ id: c.id, status: c.status, signedAt: iso(c.signedAt), documentInstanceId: c.documentInstanceId ?? undefined })),
    // Süresi geçmiş "pending" deneme artık sürmüyor — engel sayılmaz.
    checkouts: checkouts.map((c) => ({ id: c.id, paymentId: c.paymentId, status: c.status === "pending" && c.expiresAt && c.expiresAt.toISOString() < nowIso ? "expired" : c.status })),
    followUps,
    payouts: payouts.map((p) => ({ ...p, periodStart: p.periodStart.toISOString(), periodEnd: p.periodEnd.toISOString() })),
    documents,
    clubMemberships,
    owned: {
      portalAccess: ids(portal),
      feedbackInvites: ids(feedbackInvites),
      lessonAssessments: ids(lessonAssessments),
      periodicAssessments: ids(periodicAssessments),
      homeworkSubmissions: ids(homeworkSubmissions),
      homework: ids(homework),
      teacherFeedback: ids(teacherFeedback),
      studentFeedback: ids(studentFeedback),
      curriculumTopics: ids(curriculumTopics),
      socialMediaConsents: ids(socialMediaConsents),
      kvkkConsents: ids(kvkkConsents),
      riskLogs: ids(riskLogs),
      notifications: ids(notifications),
      profilePhotos: ids(profilePhotos),
      communicationMessages: ids(communicationMessages),
    },
    detach: { tasks: ids(tasks), clubApplications: ids(clubApplications), trialConversions: ids(trialConversions) },
    accounts,
    teacherNames: Object.fromEntries(teachers.map((t) => [t.id, t.name])),
    nowIso,
  };
}

async function loadTeacherSnapshot(db: Db, tenantId: string, teacherId: string, nowIso: string): Promise<TeacherPurgeSnapshot | null> {
  const where = { tenantId, teacherId };
  const teacher = await db.teacher.findFirst({
    where: { id: teacherId, tenantId },
    select: { id: true, name: true, displayId: true, active: true, deletedAt: true, purgedAt: true },
  });
  if (!teacher) return null;
  const [lessons, series, makeups, payouts, feeRules, exclusions, students] = await Promise.all([
    db.lesson.findMany({ where, select: { id: true, studentId: true, teacherId: true, startAt: true, status: true, seriesId: true, clubSessionId: true } }),
    db.lessonSeries.findMany({ where, select: { id: true, status: true } }),
    db.makeupRequest.findMany({ where, select: { id: true } }),
    db.teacherPayout.findMany({ where, select: { id: true, teacherId: true, periodStart: true, periodEnd: true, status: true } }),
    db.teacherFeeRule.findMany({ where, select: { id: true } }),
    db.teacherPayoutExclusion.findMany({ where, select: { id: true } }),
    db.student.findMany({
      where: { tenantId, OR: [{ teacherId }, { enrollments: { array_contains: [{ teacherId }] as unknown as Prisma.InputJsonValue } }] },
      select: { id: true, name: true, active: true, deletedAt: true, teacherId: true, enrollments: true },
    }),
  ]);
  const [availabilityRequests, profilePhotos, documents, communicationMessages] = await Promise.all([
    db.teacherAvailabilityRequest.findMany({ where, select: { id: true } }),
    db.profilePhoto.findMany({ where: { tenantId, ownerType: "teacher", ownerId: teacherId }, select: { id: true } }),
    db.documentInstance.findMany({ where: { tenantId, teacherId, studentId: null }, select: { id: true } }),
    db.communicationMessage.findMany({ where: { tenantId, recipientType: "TEACHER", recipientId: teacherId }, select: { id: true } }),
  ]);
  const [lessonAssessments, periodicAssessments, homework, teachingMaterials, teacherFeedback, studentFeedback, curriculumTopics, trialLessons] =
    await Promise.all([
      db.lessonAssessment.findMany({ where, select: { id: true } }),
      db.periodicAssessment.findMany({ where, select: { id: true } }),
      db.homework.findMany({ where, select: { id: true } }),
      db.teachingMaterial.findMany({ where, select: { id: true } }),
      db.teacherFeedback.findMany({ where, select: { id: true } }),
      db.studentFeedback.findMany({ where, select: { id: true } }),
      db.studentCurriculumTopic.findMany({ where, select: { id: true } }),
      db.trialLesson.findMany({ where, select: { id: true } }),
    ]);
  const [tasks, clubs] = await Promise.all([
    db.task.findMany({ where: taskWhere(tenantId, "teacher", teacherId), select: { id: true } }),
    db.club.findMany({ where: { tenantId, teacherIds: { array_contains: [teacherId] } }, select: { id: true } }),
  ]);
  const accounts = await loadAccounts(db, tenantId, { teacherId });
  return {
    kind: "teacher",
    person: { id: teacher.id, name: teacher.name, displayId: teacher.displayId ?? undefined, active: teacher.active, deletedAt: iso(teacher.deletedAt), purgedAt: iso(teacher.purgedAt) },
    lessons: lessons.map((l) => ({ ...l, startAt: l.startAt.toISOString(), seriesId: l.seriesId ?? undefined, clubSessionId: l.clubSessionId ?? undefined })),
    series,
    makeups,
    payouts: payouts.map((p) => ({ ...p, periodStart: p.periodStart.toISOString(), periodEnd: p.periodEnd.toISOString() })),
    feeRules: ids(feeRules),
    payoutExclusions: ids(exclusions),
    students: students.map((s) => {
      const enrollments = (s.enrollments as { teacherId?: string; active?: boolean }[] | null) ?? [];
      return {
        id: s.id,
        name: s.name,
        active: s.active,
        deletedAt: iso(s.deletedAt),
        activeLink: s.teacherId === teacherId || enrollments.some((e) => e.active && e.teacherId === teacherId),
      };
    }),
    owned: {
      availabilityRequests: ids(availabilityRequests),
      profilePhotos: ids(profilePhotos),
      documents: ids(documents),
      communicationMessages: ids(communicationMessages),
    },
    history: {
      lessonAssessments: ids(lessonAssessments),
      periodicAssessments: ids(periodicAssessments),
      homework: ids(homework),
      teachingMaterials: ids(teachingMaterials),
      teacherFeedback: ids(teacherFeedback),
      studentFeedback: ids(studentFeedback),
      curriculumTopics: ids(curriculumTopics),
      trialLessons: ids(trialLessons),
    },
    detach: { tasks: ids(tasks), clubs: ids(clubs) },
    accounts,
    nowIso,
  };
}

/** Görev kişiye iki yoldan bağlanır: özel alan (studentId/teacherId) ve genel bağ (relatedEntityType/Id + ad etiketi). */
function taskWhere(tenantId: string, kind: PurgeKind, id: string) {
  const field = kind === "student" ? { studentId: id } : { teacherId: id };
  return { tenantId, OR: [field, { relatedEntityType: kind, relatedEntityId: id }] };
}

/**
 * Kişiye bağlı giriş hesapları. Hesap başka bir öğrenciye (portal erişimi / `studentId`), bir öğretmen kaydına
 * veya yönetim rolüne de bağlıysa `otherLinks` > 0 → hesap kapatılmaz, yalnız bu kişiyle bağı kaldırılır.
 */
async function loadAccounts(
  db: Db,
  tenantId: string,
  link: { studentId: string; portalUserIds: string[] } | { teacherId: string }
): Promise<PurgeAccountRow[]> {
  const users = await db.user.findMany({
    where:
      "studentId" in link
        ? { tenantId, deletedAt: null, OR: [{ studentId: link.studentId }, { id: { in: link.portalUserIds } }] }
        : { tenantId, deletedAt: null, teacherId: link.teacherId },
    select: { id: true, role: true, email: true, studentId: true, teacherId: true },
  });
  if (users.length === 0) return [];
  const access = await db.studentPortalAccess.findMany({
    where: { tenantId, userId: { in: users.map((u) => u.id) }, status: { not: "revoked" } },
    select: { id: true, userId: true, studentId: true },
  });
  return users.map((u) => {
    if ("studentId" in link) {
      const mine = access.filter((a) => a.userId === u.id && a.studentId === link.studentId);
      const others = new Set(access.filter((a) => a.userId === u.id && a.studentId !== link.studentId).map((a) => a.studentId));
      if (u.studentId && u.studentId !== link.studentId) others.add(u.studentId);
      const otherRole = u.teacherId || (u.role !== "STUDENT" && u.role !== "PARENT") ? 1 : 0;
      return { userId: u.id, role: u.role, email: u.email, otherLinks: others.size + otherRole, portalAccessIds: mine.map((a) => a.id) };
    }
    const otherRole = (u.role !== "TEACHER" ? 1 : 0) + (u.studentId ? 1 : 0) + (access.some((a) => a.userId === u.id) ? 1 : 0);
    return { userId: u.id, role: u.role, email: u.email, otherLinks: otherRole, portalAccessIds: [] };
  });
}

export async function loadPurgeSnapshotDb(kind: PurgeKind, id: string, db: Db = prisma): Promise<PurgeSnapshot | null> {
  const tid = requireTenantId();
  const nowIso = new Date().toISOString();
  return kind === "student" ? loadStudentSnapshot(db, tid, id, nowIso) : loadTeacherSnapshot(db, tid, id, nowIso);
}

/** Tablo anahtarı → kimliğe göre tenant kapsamlı silme. Silinen sayı beklenenden azsa veri değişmiştir → çatışma. */
async function deleteByIds(tx: Prisma.TransactionClient, tenantId: string, key: PurgeTableKey, idList: string[]) {
  if (idList.length === 0) return;
  const where = { tenantId, id: { in: idList } };
  let r: { count: number };
  switch (key) {
    case "lessons": r = await tx.lesson.deleteMany({ where }); break;
    case "attendances": r = await tx.attendance.deleteMany({ where }); break;
    case "series": r = await tx.lessonSeries.deleteMany({ where }); break;
    case "makeups": r = await tx.makeupRequest.deleteMany({ where }); break;
    case "payments": r = await tx.payment.deleteMany({ where }); break;
    case "contracts": r = await tx.studentContract.deleteMany({ where }); break;
    case "documents": r = await tx.documentInstance.deleteMany({ where }); break;
    case "checkouts": r = await tx.paymentCheckoutAttempt.deleteMany({ where }); break;
    case "followUps": r = await tx.paymentFollowUpCase.deleteMany({ where }); break;
    case "clubMemberships": r = await tx.clubMembership.deleteMany({ where }); break;
    case "portalAccess": r = await tx.studentPortalAccess.deleteMany({ where }); break;
    case "feedbackInvites": r = await tx.feedbackInvite.deleteMany({ where }); break;
    case "lessonAssessments": r = await tx.lessonAssessment.deleteMany({ where }); break;
    case "periodicAssessments": r = await tx.periodicAssessment.deleteMany({ where }); break;
    case "homeworkSubmissions": r = await tx.homeworkSubmission.deleteMany({ where }); break;
    case "homework": r = await tx.homework.deleteMany({ where }); break;
    case "teacherFeedback": r = await tx.teacherFeedback.deleteMany({ where }); break;
    case "studentFeedback": r = await tx.studentFeedback.deleteMany({ where }); break;
    case "curriculumTopics": r = await tx.studentCurriculumTopic.deleteMany({ where }); break;
    case "socialMediaConsents": r = await tx.socialMediaConsent.deleteMany({ where }); break;
    case "kvkkConsents": r = await tx.kvkkConsent.deleteMany({ where }); break;
    case "riskLogs": r = await tx.studentAttendanceRiskLog.deleteMany({ where }); break;
    case "notifications": r = await tx.notification.deleteMany({ where }); break;
    case "profilePhotos": r = await tx.profilePhoto.deleteMany({ where }); break;
    case "communicationMessages": r = await tx.communicationMessage.deleteMany({ where }); break;
    case "availabilityRequests": r = await tx.teacherAvailabilityRequest.deleteMany({ where }); break;
    case "teachingMaterials": r = await tx.teachingMaterial.deleteMany({ where }); break;
    case "trialLessons": r = await tx.trialLesson.deleteMany({ where }); break;
    case "feeRules": r = await tx.teacherFeeRule.deleteMany({ where }); break;
    case "payoutExclusions": r = await tx.teacherPayoutExclusion.deleteMany({ where }); break;
    case "payouts": r = await tx.teacherPayout.deleteMany({ where }); break;
    case "students": throw new Error("Öğrenci kaydı öğretmen silmesiyle asla silinmez.");
  }
  // Ödev silinince teslimleri DB'de cascade gider; teslimler önce açıkça silindiği için sayı tutar.
  if (r.count !== idList.length) throw new PurgeConflictError();
}

/** FK sırası: çocuk → ebeveyn (telafi → yoklama → ders → seri; takip/deneme → ödeme → sözleşme). */
const DELETE_ORDER: PurgeTableKey[] = [
  "followUps",
  "checkouts",
  "makeups",
  "attendances",
  "lessons",
  "series",
  "payments",
  "contracts",
  "documents",
  "clubMemberships",
  "portalAccess",
  "homeworkSubmissions",
  "homework",
  "feedbackInvites",
  "lessonAssessments",
  "periodicAssessments",
  "teacherFeedback",
  "studentFeedback",
  "curriculumTopics",
  "socialMediaConsents",
  "kvkkConsents",
  "riskLogs",
  "notifications",
  "profilePhotos",
  "communicationMessages",
  "availabilityRequests",
  "teachingMaterials",
  "trialLessons",
  "payoutExclusions",
  "payouts",
  "feeRules",
];

export type PurgeExecResult = { status: "done"; plan: PurgePlan; closedUserIds: string[] } | { status: "already_purged" } | { status: "not_found" };

export async function executePurgeDb(kind: PurgeKind, id: string, expectedFingerprint: string): Promise<PurgeExecResult> {
  const tid = requireTenantId();
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tid}), hashtext(${`purge:${kind}:${id}`}))`;
        const snap = await loadPurgeSnapshotDb(kind, id, tx);
        if (!snap) return { status: "not_found" as const };
        if (snap.person.purgedAt) return { status: "already_purged" as const };
        const plan = planPersonPurge(snap);
        if (plan.fingerprint !== expectedFingerprint || !plan.eligible) throw new PurgeConflictError();

        for (const key of DELETE_ORDER) await deleteByIds(tx, tid, key, bucketIds(plan.remove, key));

        const detach = (key: Parameters<typeof bucketIds>[1]) => bucketIds(plan.detach, key);
        const field = kind === "student" ? "studentId" : "teacherId";
        if (detach("tasks").length) {
          const taskIds = { tenantId: tid, id: { in: detach("tasks") } };
          await tx.task.updateMany({ where: { ...taskIds, [field]: id }, data: { [field]: null } });
          await tx.task.updateMany({
            where: { ...taskIds, relatedEntityType: kind, relatedEntityId: id },
            data: { relatedEntityType: null, relatedEntityId: null, relatedEntityLabel: null },
          });
        }
        if (detach("clubApplications").length) {
          await tx.clubApplication.updateMany({ where: { tenantId: tid, id: { in: detach("clubApplications") } }, data: { studentId: null } });
        }
        if (detach("trialConversions").length) {
          await tx.trialLesson.updateMany({ where: { tenantId: tid, id: { in: detach("trialConversions") } }, data: { convertedStudentId: null } });
        }
        for (const clubId of detach("clubs")) {
          const club = await tx.club.findFirst({ where: { id: clubId, tenantId: tid }, select: { teacherIds: true } });
          const next = ((club?.teacherIds as string[] | null) ?? []).filter((t) => t !== id);
          await tx.club.updateMany({ where: { id: clubId, tenantId: tid }, data: { teacherIds: next } });
        }

        const now = new Date();
        const closedUserIds: string[] = [];
        for (const a of plan.accounts) {
          if (a.action === "close") {
            await tx.user.updateMany({
              where: { id: a.userId, tenantId: tid },
              data: {
                active: false,
                deletedAt: now,
                sessionsRevokedAt: now,
                invitationPending: false,
                email: closedAccountEmail(a.userId),
                displayName: null,
                studentId: null,
                teacherId: null,
              },
            });
            await tx.passwordResetToken.deleteMany({ where: { tenantId: tid, userId: a.userId } });
            await tx.emailChangeToken.deleteMany({ where: { tenantId: tid, userId: a.userId } });
            await tx.devicePushToken.deleteMany({ where: { tenantId: tid, userId: a.userId } });
            await tx.userSession.deleteMany({ where: { tenantId: tid, userId: a.userId } });
            closedUserIds.push(a.userId);
          } else {
            await tx.user.updateMany({ where: { id: a.userId, tenantId: tid, [field]: id }, data: { [field]: null } });
          }
        }

        if (plan.outcome === "delete") {
          const r =
            kind === "student"
              ? await tx.student.deleteMany({ where: { id, tenantId: tid } })
              : await tx.teacher.deleteMany({ where: { id, tenantId: tid } });
          if (r.count !== 1) throw new PurgeConflictError();
        } else {
          const cleared = Object.fromEntries((kind === "student" ? STUDENT_PII_CLEAR : TEACHER_PII_CLEAR).map((k) => [k, null]));
          const data = { ...cleared, name: plan.anonymizedName, email: "", phone: "", active: false, purgedAt: now };
          if (kind === "student") await tx.student.updateMany({ where: { id, tenantId: tid }, data: { ...data, notes: "" } });
          else await tx.teacher.updateMany({ where: { id, tenantId: tid }, data });
        }
        return { status: "done" as const, plan, closedUserIds };
      },
      { timeout: 60_000, maxWait: 10_000 }
    );
  } catch (e) {
    // Araya giren yeni bağlı kayıt (ör. bu kişiye ders yazıldı) FK'ye takılır → çatışma; hiçbir şey yazılmadı.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") throw new PurgeConflictError();
    throw e;
  }
}
