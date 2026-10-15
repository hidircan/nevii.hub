/**
 * Kalıcı silme — STORE_MODE=json/memory yükleyici + yürütücü (demo/test). Plan, db moduyla AYNI saf fonksiyondan
 * (`person-purge.ts`) gelir; burada yalnız veri kaynağı farklıdır: çekirdek koleksiyonlar `AppData`'da, diğer
 * tablolar modüllerin kendi JSON dosyalarında (aynı dizin: `resolveDataDir`). Süreç içi tek kuyrukla sıralanır;
 * yazmadan önce plan yeniden kurulur ve parmak izi önizlemeyle aynı değilse hiçbir şey yazılmaz.
 * Bilinçli fark: demo hesaplarında e-posta serbest bırakılmaz (bootstrap hesaplar koddadır) — hesap kapatılır.
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { resolveDataDir } from "./config";
import { requireTenantId } from "./tenant-context";
import type { AppData } from "./types";
import {
  PurgeConflictError,
  STUDENT_PII_CLEAR,
  TEACHER_PII_CLEAR,
  bucketIds,
  planPersonPurge,
  purgePayoutRewrite,
  unplanMakeupForPurge,
  type PurgeAccountRow,
  type PurgeDetachKey,
  type PurgeKind,
  type PurgeMode,
  type PurgeSnapshot,
  type PurgeTableKey,
  type WipeOptions,
} from "./person-purge";
import type { PurgeExecResult } from "./person-purge-db";

type Row = Record<string, unknown> & { id: string };
type StoreIo = { readData: () => Promise<AppData>; writeData: (d: AppData) => Promise<void> };

/** Tablo anahtarı → JSON dosyası (modüllerin kullandığı adlar; satır alanları Prisma ile aynı). */
const FILES: Partial<Record<PurgeTableKey | PurgeDetachKey, string>> = {
  contracts: "student-contracts.json",
  documents: "document-instances.json",
  checkouts: "payment-checkout-attempts.json",
  followUps: "tahsilat-cases.json",
  clubMemberships: "club-memberships.json",
  portalAccess: "student-portal-access.json",
  feedbackInvites: "feedback-invites.json",
  lessonAssessments: "lesson-assessments.json",
  periodicAssessments: "periodic-assessments.json",
  homeworkSubmissions: "homework-submissions.json",
  homework: "homework.json",
  teacherFeedback: "teacher-feedback.json",
  studentFeedback: "student-feedback.json",
  curriculumTopics: "curriculum-topics.json",
  socialMediaConsents: "social-media-consents.json",
  kvkkConsents: "kvkk-consents.json",
  riskLogs: "student-attendance-risk-log.json",
  notifications: "notifications.json",
  profilePhotos: "profile-photos.json",
  communicationMessages: "communication-messages.json",
  callLogs: "call-logs.json",
  messageLogs: "message-logs.json",
  availabilityRequests: "teacher-availability-requests.json",
  teachingMaterials: "teaching-materials.json",
  trialLessons: "trial-lessons.json",
  clubApplications: "club-applications.json",
  trialConversions: "trial-lessons.json",
  clubs: "clubs.json",
};

/** AppData içindeki koleksiyonlar. */
const APPDATA: Partial<Record<PurgeTableKey, keyof AppData>> = {
  lessons: "lessons",
  attendances: "attendances",
  series: "lessonSeries",
  makeups: "makeupRequests",
  payments: "payments",
  feeRules: "teacherFeeRules",
  payoutExclusions: "teacherPayoutExclusions",
  payouts: "teacherPayouts",
};

const filePath = (name: string) => path.join(resolveDataDir(path.join(process.cwd(), "data")), name);

async function readRows(name: string): Promise<Row[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath(name), "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as Row[]) : [];
  } catch {
    return [];
  }
}

async function writeRows(name: string, rows: Row[]) {
  await fs.mkdir(path.dirname(filePath(name)), { recursive: true });
  await fs.writeFile(filePath(name), JSON.stringify(rows, null, 2));
}

/** `tasks.json` dizi değil `{ tasks: [...] }` şeklindedir. */
async function readTasks(): Promise<{ shape: Record<string, unknown>; tasks: Row[] }> {
  try {
    const shape = JSON.parse(await fs.readFile(filePath("tasks.json"), "utf8")) as Record<string, unknown>;
    return { shape, tasks: Array.isArray(shape.tasks) ? (shape.tasks as Row[]) : [] };
  } catch {
    return { shape: {}, tasks: [] };
  }
}

const inTenant = (tid: string | null) => (r: Row) => !tid || !r.tenantId || r.tenantId === tid;
const idsWhere = (rows: Row[], tid: string | null, pred: (r: Row) => boolean) => rows.filter((r) => inTenant(tid)(r) && pred(r)).map((r) => r.id);

async function loadAccounts(tid: string, link: { studentId: string } | { teacherId: string }): Promise<PurgeAccountRow[]> {
  const users = await import("./auth/users");
  const portal = await readRows(FILES.portalAccess!);
  const userIds = new Set<string>();
  if ("studentId" in link) {
    const direct = await users.getUserIdByStudentId(tid, link.studentId);
    if (direct) userIds.add(direct);
    for (const p of portal) if (p.studentId === link.studentId && inTenant(tid)(p)) userIds.add(String(p.userId));
  } else {
    const direct = await users.getUserIdByTeacherId(tid, link.teacherId);
    if (direct) userIds.add(direct);
  }
  const rows: PurgeAccountRow[] = [];
  for (const userId of userIds) {
    const st = await users.getUserAccountStatus(userId);
    if (!st) continue;
    const live = portal.filter((p) => p.userId === userId && p.status !== "revoked");
    if ("studentId" in link) {
      const others = new Set(live.filter((p) => p.studentId !== link.studentId).map((p) => String(p.studentId)));
      const otherRole = st.role !== "STUDENT" && st.role !== ("PARENT" as string) ? 1 : 0;
      rows.push({
        userId,
        role: st.role,
        email: st.email,
        otherLinks: others.size + otherRole,
        portalAccessIds: live.filter((p) => p.studentId === link.studentId).map((p) => p.id),
      });
    } else {
      rows.push({ userId, role: st.role, email: st.email, otherLinks: (st.role !== "TEACHER" ? 1 : 0) + live.length, portalAccessIds: [] });
    }
  }
  return rows;
}

export async function loadPurgeSnapshotFiles(io: StoreIo, kind: PurgeKind, id: string): Promise<PurgeSnapshot | null> {
  const data = await io.readData();
  const tid = requireTenantId();
  const nowIso = new Date().toISOString();
  const side = async (key: PurgeTableKey | PurgeDetachKey) => readRows(FILES[key]!);
  if (kind === "student") {
    const s = data.students.find((x) => x.id === id);
    if (!s) return null;
    const lessons = data.lessons.filter((l) => l.studentId === id);
    const teacherIds = new Set(lessons.map((l) => l.teacherId));
    const own = async (key: PurgeTableKey, field = "studentId") => idsWhere(await side(key), tid, (r) => r[field] === id);
    const [contracts, checkouts, followUps, tasks] = await Promise.all([side("contracts"), side("checkouts"), side("followUps"), readTasks()]);
    return {
      kind: "student",
      person: { id: s.id, name: s.name, displayId: s.displayId, active: s.active, deletedAt: s.deletedAt, purgedAt: s.purgedAt },
      lessons: lessons.map((l) => ({ id: l.id, studentId: l.studentId, teacherId: l.teacherId, startAt: l.startAt, status: l.status, seriesId: l.seriesId, clubSessionId: l.clubSessionId })),
      attendances: data.attendances.filter((a) => a.studentId === id).map((a) => ({ id: a.id, lessonId: a.lessonId })),
      series: data.lessonSeries.filter((x) => x.studentId === id).map((x) => ({ id: x.id })),
      makeups: data.makeupRequests
        .filter((m) => m.studentId === id)
        .map((m) => ({ id: m.id, attendanceId: m.attendanceId, sourceLessonId: m.sourceLessonId, confirmedLessonId: m.confirmedLessonId })),
      payments: data.payments
        .filter((p) => p.studentId === id)
        .map((p) => ({ id: p.id, amount: p.amount, paidAmount: p.paidAmount, status: p.status, contractId: p.contractId, lessonId: p.lessonId, clubMembershipId: p.clubMembershipId })),
      contracts: contracts
        .filter((c) => inTenant(tid)(c) && c.studentId === id)
        .map((c) => ({ id: c.id, status: String(c.status), signedAt: c.signedAt as string | undefined, documentInstanceId: c.documentInstanceId as string | undefined })),
      checkouts: checkouts
        .filter((c) => inTenant(tid)(c) && c.studentId === id)
        .map((c) => ({
          id: c.id,
          paymentId: String(c.paymentId),
          status: c.status === "pending" && typeof c.expiresAt === "string" && c.expiresAt < nowIso ? "expired" : String(c.status),
        })),
      followUps: followUps.filter((f) => inTenant(tid)(f) && f.studentId === id).map((f) => ({ id: f.id, paymentId: String(f.paymentId) })),
      payouts: data.teacherPayouts
        .filter((p) => teacherIds.has(p.teacherId))
        .map((p) => ({
          id: p.id,
          teacherId: p.teacherId,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          status: p.status,
          totalAmount: p.totalAmount,
          lessonIds: (p.lineSnapshot ?? []).map((x) => x.lessonId),
          lineSnapshot: p.lineSnapshot,
          lineOverrides: p.lineOverrides,
          version: p.version ?? 0,
        })),
      paymentTasks: tasks.tasks
        .filter((r) => inTenant(tid)(r) && typeof r.paymentId === "string" && data.payments.some((p) => p.studentId === id && p.id === r.paymentId))
        .map((r) => ({ id: r.id, paymentId: String(r.paymentId) })),
      documents: (await own("documents")).map((x) => ({ id: x })),
      clubMemberships: (await own("clubMemberships")).map((x) => ({ id: x })),
      owned: {
        portalAccess: await own("portalAccess"),
        feedbackInvites: await own("feedbackInvites"),
        lessonAssessments: await own("lessonAssessments"),
        periodicAssessments: await own("periodicAssessments"),
        homeworkSubmissions: await own("homeworkSubmissions"),
        homework: await own("homework"),
        teacherFeedback: await own("teacherFeedback"),
        studentFeedback: await own("studentFeedback"),
        curriculumTopics: await own("curriculumTopics"),
        socialMediaConsents: await own("socialMediaConsents"),
        kvkkConsents: idsWhere(await side("kvkkConsents"), tid, (r) => r.subjectType === "student" && r.subjectId === id),
        riskLogs: await own("riskLogs"),
        notifications: await own("notifications", "targetStudentId"),
        profilePhotos: idsWhere(await side("profilePhotos"), tid, (r) => r.ownerType === "student" && r.ownerId === id),
        communicationMessages: idsWhere(await side("communicationMessages"), tid, (r) => (r.recipientType === "PARENT" || r.recipientType === "STUDENT") && r.recipientId === id),
        callLogs: idsWhere(await side("callLogs"), tid, (r) => (r.contactType === "student" || r.contactType === "parent") && r.contactId === id),
        messageLogs: idsWhere(await side("messageLogs"), tid, (r) => (r.contactType === "student" || r.contactType === "parent") && r.contactId === id),
        payoutExclusions: (data.teacherPayoutExclusions ?? []).filter((x) => lessons.some((l) => l.id === x.lessonId)).map((x) => x.id),
      },
      groupSessionOthers: Object.fromEntries(
        lessons
          .filter((l) => l.clubSessionId)
          .map((l) => [l.clubSessionId!, data.lessons.filter((o) => o.clubSessionId === l.clubSessionId && o.studentId !== id).length])
      ),
      detach: {
        tasks: idsWhere(tasks.tasks, tid, (r) => r.studentId === id || (r.relatedEntityType === "student" && r.relatedEntityId === id)),
        clubApplications: await own("clubApplications" as PurgeTableKey),
        trialConversions: await own("trialLessons", "convertedStudentId"),
      },
      accounts: await loadAccounts(tid, { studentId: id }),
      teacherNames: Object.fromEntries(data.teachers.filter((t) => teacherIds.has(t.id)).map((t) => [t.id, t.name])),
      nowIso,
    };
  }
  const t = data.teachers.find((x) => x.id === id);
  if (!t) return null;
  const own = async (key: PurgeTableKey) => idsWhere(await side(key), tid, (r) => r.teacherId === id);
  const tasks = await readTasks();
  return {
    kind: "teacher",
    person: { id: t.id, name: t.name, displayId: t.displayId, active: t.active !== false, deletedAt: t.deletedAt, purgedAt: t.purgedAt },
    lessons: data.lessons
      .filter((l) => l.teacherId === id)
      .map((l) => ({ id: l.id, studentId: l.studentId, teacherId: l.teacherId, startAt: l.startAt, status: l.status, seriesId: l.seriesId, clubSessionId: l.clubSessionId })),
    series: data.lessonSeries.filter((x) => x.teacherId === id).map((x) => ({ id: x.id, status: x.status })),
    makeups: data.makeupRequests.filter((m) => m.teacherId === id).map((m) => ({ id: m.id })),
    payouts: data.teacherPayouts
      .filter((p) => p.teacherId === id)
      .map((p) => ({ id: p.id, teacherId: p.teacherId, periodStart: p.periodStart, periodEnd: p.periodEnd, status: p.status, totalAmount: p.totalAmount })),
    feeRules: data.teacherFeeRules.filter((r) => r.teacherId === id).map((r) => r.id),
    payoutExclusions: (data.teacherPayoutExclusions ?? []).filter((r) => r.teacherId === id).map((r) => r.id),
    students: data.students
      .filter((s) => s.teacherId === id || s.enrollments?.some((e) => e.teacherId === id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        active: s.active,
        deletedAt: s.deletedAt,
        activeLink: s.teacherId === id || Boolean(s.enrollments?.some((e) => e.active && e.teacherId === id)),
      })),
    owned: {
      availabilityRequests: await own("availabilityRequests"),
      profilePhotos: idsWhere(await side("profilePhotos"), tid, (r) => r.ownerType === "teacher" && r.ownerId === id),
      documents: idsWhere(await side("documents"), tid, (r) => r.teacherId === id && !r.studentId),
      communicationMessages: idsWhere(await side("communicationMessages"), tid, (r) => r.recipientType === "TEACHER" && r.recipientId === id),
    },
    history: {
      lessonAssessments: await own("lessonAssessments"),
      periodicAssessments: await own("periodicAssessments"),
      homework: await own("homework"),
      teachingMaterials: await own("teachingMaterials"),
      teacherFeedback: await own("teacherFeedback"),
      studentFeedback: await own("studentFeedback"),
      curriculumTopics: await own("curriculumTopics"),
      trialLessons: await own("trialLessons"),
    },
    detach: {
      tasks: idsWhere(tasks.tasks, tid, (r) => r.teacherId === id || (r.relatedEntityType === "teacher" && r.relatedEntityId === id)),
      clubs: idsWhere(await side("clubs"), tid, (r) => Array.isArray(r.teacherIds) && (r.teacherIds as string[]).includes(id)),
    },
    accounts: await loadAccounts(tid, { teacherId: id }),
    lessonLinks: (() => {
      const lessonIds = new Set(data.lessons.filter((l) => l.teacherId === id).map((l) => l.id));
      const seriesIds = new Set(data.lessonSeries.filter((x) => x.teacherId === id).map((x) => x.id));
      const atts = data.attendances.filter((a) => lessonIds.has(a.lessonId)).map((a) => a.id);
      const attSet = new Set(atts);
      const linked = data.makeupRequests.filter(
        (m) => m.teacherId !== id && (attSet.has(m.attendanceId) || lessonIds.has(m.sourceLessonId) || (!!m.confirmedLessonId && lessonIds.has(m.confirmedLessonId)))
      );
      const owned = (m: { attendanceId: string; sourceLessonId: string }) => attSet.has(m.attendanceId) || lessonIds.has(m.sourceLessonId);
      return {
        attendances: atts,
        makeups: linked.filter(owned).map((m) => m.id),
        makeupPlans: linked.filter((m) => !owned(m)).map((m) => m.id),
        payments: data.payments.filter((p) => p.lessonId && lessonIds.has(p.lessonId)).map((p) => p.id),
        seriesLessons: data.lessons.filter((l) => l.seriesId && seriesIds.has(l.seriesId) && l.teacherId !== id).map((l) => l.id),
      };
    })(),
    teachers: data.teachers.filter((x) => !x.purgedAt).map((x) => ({ id: x.id, name: x.name, active: x.active !== false, deletedAt: x.deletedAt })),
    nowIso,
  };
}

// ponytail: süreç içi tek kuyruk — json/memory tek süreçli demo içindir; çok süreçte db modu kullanılır.
let queue: Promise<unknown> = Promise.resolve();

export async function executePurgeFiles(
  io: StoreIo,
  kind: PurgeKind,
  id: string,
  expectedFingerprint: string,
  mode: PurgeMode = "standard",
  opts: WipeOptions = {}
): Promise<PurgeExecResult> {
  const run = queue.then(() => executeUnlocked(io, kind, id, expectedFingerprint, mode, opts));
  queue = run.catch(() => undefined);
  return run;
}

async function executeUnlocked(
  io: StoreIo,
  kind: PurgeKind,
  id: string,
  expectedFingerprint: string,
  mode: PurgeMode,
  opts: WipeOptions
): Promise<PurgeExecResult> {
  const snap = await loadPurgeSnapshotFiles(io, kind, id);
  if (!snap) return { status: "not_found" };
  if (snap.person.purgedAt) return { status: "already_purged" };
  const plan = planPersonPurge(snap, mode, opts);
  if (plan.fingerprint !== expectedFingerprint || !plan.eligible) throw new PurgeConflictError();

  // Devir, bağ kaldırma ve hakediş yeniden yazımı silmeden ÖNCE (db yürütücüsüyle aynı sıra).
  const raw = await io.readData();
  const ra = plan.reassign;
  const set = (list: string[] | undefined) => new Set(list ?? []);
  const reLessons = set(ra?.lessons);
  const reSeries = set(ra?.series);
  const reMakeups = set(ra?.makeups);
  const reStudents = set(ra?.students);
  const unSeries = set(bucketIds(plan.detach, "seriesLessons"));
  const unPay = set(bucketIds(plan.detach, "lessonPayments"));
  const unPlan = set(bucketIds(plan.detach, "makeupPlans"));
  const to = ra?.targetTeacherId ?? "";
  const changes = new Map(plan.payoutChanges.filter((c) => c.action !== "legacy").map((c) => [c.payoutId, c]));
  const data: AppData = {
    ...raw,
    lessons: raw.lessons.map((l) => (reLessons.has(l.id) ? { ...l, teacherId: to } : unSeries.has(l.id) ? { ...l, seriesId: undefined } : l)),
    lessonSeries: raw.lessonSeries.map((x) => (reSeries.has(x.id) ? { ...x, teacherId: to } : x)),
    makeupRequests: raw.makeupRequests.map((m) => {
      if (reMakeups.has(m.id)) return { ...m, teacherId: to };
      if (!unPlan.has(m.id) || !m.confirmedLessonId) return m;
      const patch = unplanMakeupForPurge(m, m.confirmedLessonId, new Date().toISOString());
      return { ...m, ...patch, confirmedLessonId: undefined, slaDeadline: undefined } as typeof m;
    }),
    payments: raw.payments.map((p) => (unPay.has(p.id) ? { ...p, lessonId: undefined } : p)),
    students: raw.students.map((s) =>
      reStudents.has(s.id)
        ? { ...s, teacherId: s.teacherId === id ? to : s.teacherId, enrollments: s.enrollments?.map((e) => (e.teacherId === id ? { ...e, teacherId: to } : e)) }
        : s
    ),
    teacherPayouts: raw.teacherPayouts.map((p) => {
      const c = changes.get(p.id);
      if (!c) return p;
      if ((p.version ?? 0) !== c.version) throw new PurgeConflictError();
      const w = purgePayoutRewrite(p, { action: c.action as "recalc" | "scrub", lessonIds: c.lessonIds }, plan.anonymizedName);
      const out = { ...p, lineSnapshot: w.lineSnapshot, version: (p.version ?? 0) + 1 };
      if (c.action !== "recalc") return out;
      return {
        ...out,
        lineOverrides: w.lineOverrides ?? undefined,
        totalAmount: w.totalAmount!,
        totalMinutes: w.totalMinutes!,
        originalTotalAmount: w.originalTotalAmount ?? undefined,
        originalTotalMinutes: w.originalTotalMinutes ?? undefined,
      };
    }),
  };
  const reExcl = set(ra?.history.payoutExclusions);
  if (reExcl.size) {
    data.teacherPayoutExclusions = (data.teacherPayoutExclusions ?? []).map((x) => (reExcl.has(x.id) ? { ...x, teacherId: to } : x));
  }
  for (const [key, list] of Object.entries(ra?.history ?? {}) as [PurgeTableKey, string[]][]) {
    if (key === "payoutExclusions") continue;
    const targets = new Set(list);
    const rows = await readRows(FILES[key]!);
    await writeRows(FILES[key]!, rows.map((x) => (targets.has(x.id) && x.teacherId === id ? { ...x, teacherId: to } : x)));
  }
  const next: AppData = { ...data };
  for (const [key, collection] of Object.entries(APPDATA) as [PurgeTableKey, keyof AppData][]) {
    const drop = new Set(bucketIds(plan.remove, key));
    if (drop.size === 0) continue;
    (next as unknown as Record<string, unknown>)[collection] = ((data[collection] as { id: string }[] | undefined) ?? []).filter((r) => !drop.has(r.id));
  }
  for (const key of Object.keys(FILES) as (PurgeTableKey | PurgeDetachKey)[]) {
    const drop = new Set(bucketIds(plan.remove, key));
    if (drop.size === 0 || APPDATA[key as PurgeTableKey]) continue;
    const rows = await readRows(FILES[key]!);
    await writeRows(FILES[key]!, rows.filter((r) => !drop.has(r.id)));
  }
  const field = kind === "student" ? "studentId" : "teacherId";
  const patchFile = async (key: PurgeDetachKey, patch: (r: Row) => Row) => {
    const targets = new Set(bucketIds(plan.detach, key));
    if (targets.size === 0) return;
    const rows = await readRows(FILES[key]!);
    await writeRows(FILES[key]!, rows.map((r) => (targets.has(r.id) ? patch(r) : r)));
  };
  await patchFile("clubApplications", (r) => ({ ...r, studentId: null }));
  await patchFile("trialConversions", (r) => ({ ...r, convertedStudentId: undefined }));
  const clubSubstitute = ra && ra.lessons.length ? ra.targetTeacherId : undefined;
  await patchFile("clubs", (row) => {
    const rest = ((row.teacherIds as string[]) ?? []).filter((t) => t !== id);
    return { ...row, teacherIds: clubSubstitute && !rest.includes(clubSubstitute) ? [...rest, clubSubstitute] : rest };
  });
  const taskTargets = new Set(bucketIds(plan.detach, "tasks"));
  const paymentTaskTargets = new Set(bucketIds(plan.detach, "paymentTasks"));
  if (taskTargets.size || paymentTaskTargets.size) {
    const { shape, tasks } = await readTasks();
    await fs.writeFile(filePath("tasks.json"), JSON.stringify({ ...shape, tasks: tasks.map((r) => {
      const unpaid: Row = paymentTaskTargets.has(r.id) ? { ...r, paymentId: null } : r;
      if (!taskTargets.has(r.id)) return unpaid;
      const next: Row = unpaid[field] === id ? { ...unpaid, [field]: null } : { ...unpaid };
      if (typeof next.title === "string") next.title = next.title.split(snap.person.name).join(plan.anonymizedName);
      if (r.relatedEntityType === kind && r.relatedEntityId === id) {
        Object.assign(next, { relatedEntityType: undefined, relatedEntityId: undefined, relatedEntityLabel: undefined });
      }
      return next;
    }) }, null, 2));
  }

  const now = new Date().toISOString();
  if (kind === "student") {
    next.students =
      plan.outcome === "delete"
        ? data.students.filter((s) => s.id !== id)
        : data.students.map((s) => {
            if (s.id !== id) return s;
            const anon: Record<string, unknown> = { ...s, name: plan.anonymizedName, email: "", phone: "", notes: "", active: false, purgedAt: now };
            for (const k of STUDENT_PII_CLEAR) delete anon[k];
            return anon as unknown as typeof s;
          });
  } else {
    next.teachers =
      plan.outcome === "delete"
        ? data.teachers.filter((t) => t.id !== id)
        : data.teachers.map((t) => {
            if (t.id !== id) return t;
            const anon: Record<string, unknown> = { ...t, name: plan.anonymizedName, email: "", phone: "", active: false, purgedAt: now };
            for (const k of TEACHER_PII_CLEAR) delete anon[k];
            return anon as unknown as typeof t;
          });
  }
  await io.writeData(next);

  const users = await import("./auth/users");
  const closedUserIds: string[] = [];
  for (const a of plan.accounts) {
    if (a.action === "close") {
      await users.setUserActive(a.userId, false);
      closedUserIds.push(a.userId);
    }
    if (kind === "student") await users.clearUserStudentBinding(a.userId);
  }
  return { status: "done", plan, closedUserIds };
}
