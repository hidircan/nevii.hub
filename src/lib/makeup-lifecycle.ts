/**
 * Telafi yaşam döngüsü — planlama süresi, uzatma, plan silme, hak iptali.
 *
 * Süre: kayıtlı `expiresAt` anının kurum saat dilimindeki TAKVİM GÜNÜ son geçerli
 * gündür. Hak, ertesi yerel günün 00:00'ında kapanır (`now >= sınır`). Saat
 * dilimi `resolveAppTimezone` (bugün Europe/Istanbul). Yeni son gün, o yerel
 * günün öğlenine yazılır; sınır hesabı bir gün daha eklemesin.
 *
 * Süre dolumu yalnız PLANLANMAMIŞ talebi kapatır (pending/suggested/awaiting_info,
 * confirmedLessonId yok). Kaynak ders "İşlendi" olur; gerekçe birebir
 * "Telafi planlama süresi doldu". Yoklama "Geldi" yapılmaz, gerçekleşmiş telafi
 * dersi açılmaz, actualStart/actualEnd ve status=completed yazılmaz.
 *
 * Hakediş: `lessonProcessed` mevcut `isLessonProcessedForPayout` kuralıyla
 * sayılır — burada yeni bir finansal istisna YOK. Saat doluluğu istisnası
 * yalnız bu kapanışa özeldir (lesson-occupancy.ts): telafi saati yeniden dolmaz.
 */
import type { AppData, Lesson, MakeupRequest } from "./types";
import { isLessonProcessedForPayout } from "./lesson-ops";
import { makeupDurationMinutes, validateLessonSlot, type MakeupDecision } from "./makeup-engine";
import {
  MAKEUP_PLANNING_EXPIRED_REASON,
  activeMakeupLessonForRequest,
  expiresAtForLastLocalDay,
  isLegacyMakeupExpiry,
  isMakeupPlanningExpiryClosure,
  isPastMakeupPlanningDeadline,
  isUnplannedMakeup,
  makeupPlanningDeadline,
  type MakeupChangeEntry,
} from "./makeup-deadline";

export {
  MAKEUP_PLANNING_EXPIRED_REASON,
  activeMakeupLessonForRequest,
  expiresAtForLastLocalDay,
  isLegacyMakeupExpiry,
  isMakeupPlanningExpiryClosure,
  isPastMakeupPlanningDeadline,
  isUnplannedMakeup,
  makeupPlanningDeadline,
};
export type { MakeupChangeEntry };

export const ATTENDANCE_NOTE_MAX = 500;

/** Yoklama notu. `undefined` = dokunma, `null`/boş = temizle. */
export function normalizeAttendanceNote(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed.slice(0, ATTENDANCE_NOTE_MAX) : null;
}

function log(request: MakeupRequest, entry: MakeupChangeEntry): MakeupChangeEntry[] {
  return [...(request.changeLog ?? []), entry];
}

function patchSourceForExpiry(lesson: Lesson, nowIso: string, actor: string): void {
  if (lesson.status === "cancelled") return;
  if (lesson.studentAttended === true) return;
  const humanProcessed =
    lesson.lessonProcessed === true &&
    !!lesson.lessonProcessedReason &&
    lesson.lessonProcessedReason !== MAKEUP_PLANNING_EXPIRED_REASON;
  if (humanProcessed) return;
  const already = lesson.lessonProcessedReason === MAKEUP_PLANNING_EXPIRED_REASON;
  lesson.lessonProcessed = true;
  lesson.lessonProcessedAt = already ? lesson.lessonProcessedAt ?? nowIso : nowIso;
  lesson.lessonProcessedBy = already ? lesson.lessonProcessedBy ?? actor : actor;
  lesson.lessonProcessedReason = MAKEUP_PLANNING_EXPIRED_REASON;
  lesson.opsMakeupFlag = false;
  lesson.opsMakeupFlagAt = undefined;
  lesson.opsMakeupFlagBy = undefined;
  lesson.studentAbsent = false;
  lesson.studentExcused = false;
}

/** Planlanmamış ve süresi dolmuş talepleri kapatır. İkinci çağrı aynı veriyi değiştirmez. */
export function closeExpiredUnplannedMakeups<T extends { lessons: Lesson[]; makeupRequests: MakeupRequest[] }>(
  data: T,
  now: Date,
  actor = "system",
  /** true: kesme tarihinden önceki (legacy) talepler yalnız GÖRÜNÜMDE `expired` olur (ders/hakediş/DB'ye dokunulmaz). */
  options: { legacyView?: boolean } = {}
): { data: T; changed: boolean } {
  const lessons = data.lessons.map((lesson) => ({ ...lesson }));
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  let changed = false;
  const makeupRequests = data.makeupRequests.map((request) => {
    if (!isUnplannedMakeup(request)) return request;
    if (!isPastMakeupPlanningDeadline(request.expiresAt, now)) return request;
    if (isLegacyMakeupExpiry(request.expiresAt)) {
      if (!options.legacyView) return request;
      changed = true;
      return { ...request, status: "expired" as const };
    }
    changed = true;
    const source = byId.get(request.sourceLessonId);
    if (source) patchSourceForExpiry(source, now.toISOString(), actor);
    return {
      ...request,
      status: "expired" as const,
      decisionNote: request.decisionNote?.trim() ? request.decisionNote : MAKEUP_PLANNING_EXPIRED_REASON,
      decidedBy: request.decidedBy ?? actor,
      decidedAt: request.decidedAt ?? now.toISOString(),
      changeLog: log(request, {
        action: "planning_expired",
        at: now.toISOString(),
        by: actor,
        to: MAKEUP_PLANNING_EXPIRED_REASON,
      }),
    };
  });
  if (!changed) return { data, changed: false };
  return { data: { ...data, lessons, makeupRequests }, changed: true };
}

export type MakeupLifecycleCode = "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "ACK_REQUIRED";

export type MakeupLifecycleResult =
  | {
      ok: true;
      data: AppData;
      requestId: string;
      payoutTouches: { before: Lesson; after: Lesson }[];
      changedLessons: { before: Lesson; after: Lesson }[];
      notifyCancelled: Lesson[];
      rescheduled?: { before: Lesson; after: Lesson };
    }
  | { ok: false; code: MakeupLifecycleCode; message: string };

type MakeupLifecycleOpBody =
  | {
      kind: "extend";
      requestId: string;
      lastDayYmd: string;
      actorUserId: string;
      now: Date;
      acknowledgeCorrection?: boolean;
      correctionNote?: string;
    }
  | {
      kind: "revise";
      requestId: string;
      teacherId: string;
      roomId: string;
      startAt: string;
      actorUserId: string;
      now: Date;
      acknowledgeCorrection?: boolean;
      correctionNote?: string;
      allowAvailabilityOverride?: boolean;
    }
  | {
      kind: "deletePlan";
      requestId: string;
      actorUserId: string;
      now: Date;
      acknowledgeCorrection?: boolean;
      correctionNote?: string;
    }
  | {
      kind: "cancelRight";
      requestId: string;
      actorUserId: string;
      decisionNote: string;
      alsoCancelPlan?: boolean;
      now: Date;
      acknowledgeCorrection?: boolean;
      correctionNote?: string;
    };

/**
 * `expectedPayoutFlipIds`: önizlemede hakediş kapısından geçirilen (sayılma durumu değişen) ders id'leri.
 * Verilirse uygulama anındaki taze durum bunların DIŞINDA bir ders çevirirse işlem yazılmadan reddedilir
 * (önizleme ile yazma arasında veri değişti → onaylanmamış hakediş etkisi).
 */
export type MakeupLifecycleOp = MakeupLifecycleOpBody & { expectedPayoutFlipIds?: string[] };

export class MakeupLifecycleError extends Error {
  code: MakeupLifecycleCode;
  constructor(code: MakeupLifecycleCode, message: string) {
    super(message);
    this.name = "MakeupLifecycleError";
    this.code = code;
  }
}

function fail(code: MakeupLifecycleCode, message: string): MakeupLifecycleResult {
  return { ok: false, code, message };
}

function activePlanLessons(data: AppData, request: MakeupRequest): Lesson[] {
  return data.lessons.filter(
    (lesson) =>
      lesson.type === "makeup" &&
      lesson.status !== "cancelled" &&
      (lesson.id === request.confirmedLessonId || lesson.makeupRequestId === request.id)
  );
}

export function lessonHasConductMark(
  lesson: Pick<Lesson, "studentAttended" | "lessonProcessed" | "actualStartAt" | "status">
): boolean {
  return (
    lesson.studentAttended === true ||
    lesson.lessonProcessed === true ||
    !!lesson.actualStartAt ||
    lesson.status === "completed" ||
    lesson.status === "in_progress"
  );
}

function ackFailure(
  needed: boolean,
  op: { acknowledgeCorrection?: boolean; correctionNote?: string },
  message: string
): MakeupLifecycleResult | null {
  if (!needed) return null;
  if (!op.acknowledgeCorrection) return fail("ACK_REQUIRED", message);
  if ((op.correctionNote ?? "").trim().length < 5) {
    return fail(
      "VALIDATION",
      "Bu düzeltme yoklama veya hakediş kaydını etkiler. Onay kutusunu işaretleyin ve en az 5 karakterlik düzeltme notu yazın."
    );
  }
  return null;
}

function replaceLesson(data: AppData, after: Lesson): AppData {
  return { ...data, lessons: data.lessons.map((lesson) => (lesson.id === after.id ? after : lesson)) };
}

function replaceRequest(data: AppData, request: MakeupRequest): AppData {
  return { ...data, makeupRequests: data.makeupRequests.map((row) => (row.id === request.id ? request : row)) };
}

function payoutTouch(before: Lesson, after: Lesson, touches: { before: Lesson; after: Lesson }[]): void {
  touches.push({ before, after });
}

function cancelPlanLesson(lesson: Lesson): Lesson {
  return { ...lesson, status: "cancelled" };
}

const DELETE_ACK =
  "Bu telafi dersinde yoklama veya gerçekleşme kaydı var. Plan silinirse ders iptal edilir ve saati boşalır; yoklama satırı ve kaynak ders silinmez. Devam etmek için düzeltmeyi onaylayın ve en az 5 karakterlik not yazın.";

const EXTEND_ACK =
  "Süresi dolduğu için kaynak ders İşlendi görünüyor ve bu, mevcut kuralda öğretmene hakediş yazar. Son günü uzatmak bu İşlendi işaretini kaldırır. Ödenmiş bir hakediş varsa ayrıca gerekçe ve kritik şifre istenir. Devam etmek için düzeltmeyi onaylayın ve en az 5 karakterlik not yazın.";

function applyExpiryToRequest(data: AppData, request: MakeupRequest, now: Date, actor: string): { data: AppData; before?: Lesson; after?: Lesson } {
  const source = data.lessons.find((lesson) => lesson.id === request.sourceLessonId);
  const before = source ? { ...source } : undefined;
  let next = data;
  if (source) {
    const patched = { ...source };
    patchSourceForExpiry(patched, now.toISOString(), actor);
    next = replaceLesson(next, patched);
  }
  const expired: MakeupRequest = {
    ...request,
    status: "expired",
    confirmedLessonId: undefined,
    decisionNote: request.decisionNote?.trim() ? request.decisionNote : MAKEUP_PLANNING_EXPIRED_REASON,
    decidedBy: actor,
    decidedAt: now.toISOString(),
    changeLog: log(request, {
      action: "planning_expired",
      at: now.toISOString(),
      by: actor,
      to: MAKEUP_PLANNING_EXPIRED_REASON,
    }),
  };
  next = replaceRequest(next, expired);
  const after = before ? next.lessons.find((lesson) => lesson.id === before.id) : undefined;
  return { data: next, before, after };
}

export function applyMakeupLifecycle(data: AppData, op: MakeupLifecycleOp): MakeupLifecycleResult {
  const request = data.makeupRequests.find((row) => row.id === op.requestId);
  if (!request) {
    return fail("NOT_FOUND", "Telafi talebi bulunamadı. Telafi Merkezi'ni yenileyip kaydın durduğunu kontrol edin.");
  }
  const result =
    op.kind === "extend"
      ? extendDeadline(data, request, op)
      : op.kind === "revise"
        ? revisePlan(data, request, op)
        : op.kind === "deletePlan"
          ? deletePlan(data, request, op)
          : cancelRight(data, request, op);
  if (result.ok && op.expectedPayoutFlipIds) {
    const expected = new Set(op.expectedPayoutFlipIds);
    const unexpected = result.payoutTouches.some(
      (touch) => isLessonProcessedForPayout(touch.before) !== isLessonProcessedForPayout(touch.after) && !expected.has(touch.before.id)
    );
    if (unexpected) {
      return fail(
        "CONFLICT",
        "Telafi kaydı onay ekranını açtığınızdan beri değişti ve bu işlem hakedişe farklı etki eder. Hiçbir şey kaydedilmedi; Telafi Merkezi'ni yenileyip işlemi tekrar başlatın."
      );
    }
  }
  return result;
}

function extendDeadline(
  data: AppData,
  request: MakeupRequest,
  op: Extract<MakeupLifecycleOp, { kind: "extend" }>
): MakeupLifecycleResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(op.lastDayYmd)) {
    return fail("VALIDATION", "Son gün yyyy-AA-gg biçiminde olmalı. Telafi Merkezi'ndeki tarih alanından seçin.");
  }
  if (request.status === "cancelled") {
    return fail("VALIDATION", "İptal edilmiş telafi hakkı uzatılamaz. Yeni hak için ders yoklamasından Telafi açın.");
  }
  if (request.status === "completed") {
    return fail(
      "VALIDATION",
      "Gerçekleşmiş telafi, son gün uzatılarak yeniden açılmaz. Ders saatini değiştirmek için planı revize edin; bu işlem açık onay ve düzeltme notu ister."
    );
  }
  const expiresAt = expiresAtForLastLocalDay(op.lastDayYmd);
  if (isPastMakeupPlanningDeadline(expiresAt, op.now)) {
    return fail("VALIDATION", "Yeni son gün bugünden önce. Telafi Merkezi'nden bugünü veya ileri bir günü seçin.");
  }
  const plans = activePlanLessons(data, request);
  const deadline = makeupPlanningDeadline(expiresAt);
  const overflowing = plans.find((lesson) => new Date(lesson.endAt).getTime() > deadline.getTime());
  if (overflowing) {
    return fail(
      "VALIDATION",
      "Yeni son gün, planlı telafi dersinin bitişinden önce. Önce dersi bu güne çekin veya daha ileri bir son gün seçin."
    );
  }

  const source = data.lessons.find((lesson) => lesson.id === request.sourceLessonId);
  const reopeningExpiry = request.status === "expired" && !!source && isMakeupPlanningExpiryClosure(source);
  const ack = ackFailure(reopeningExpiry, op, EXTEND_ACK);
  if (ack) return ack;

  const touches: { before: Lesson; after: Lesson }[] = [];
  const changed: { before: Lesson; after: Lesson }[] = [];
  let next = data;
  if (reopeningExpiry && source) {
    const before = { ...source };
    const after: Lesson = {
      ...source,
      lessonProcessed: false,
      lessonProcessedAt: undefined,
      lessonProcessedBy: undefined,
      lessonProcessedReason: undefined,
      opsMakeupFlag: true,
      opsMakeupFlagAt: op.now.toISOString(),
      opsMakeupFlagBy: op.actorUserId,
    };
    next = replaceLesson(next, after);
    changed.push({ before, after });
    payoutTouch(before, after, touches);
  }

  const reopened = request.status === "expired" || isUnplannedMakeup(request);
  const updated: MakeupRequest = {
    ...request,
    expiresAt,
    status: request.status === "confirmed" ? "confirmed" : "pending",
    confirmedLessonId: request.status === "confirmed" ? request.confirmedLessonId : undefined,
    slaDeadline: request.status === "confirmed" ? request.slaDeadline : undefined,
    slaEscalationLevel: request.status === "confirmed" ? request.slaEscalationLevel : 0,
    changeLog: log(request, {
      action: "deadline_extended",
      at: op.now.toISOString(),
      by: op.actorUserId,
      from: request.expiresAt,
      to: expiresAt,
      note: op.correctionNote?.trim() || undefined,
    }),
  };
  if (!reopened && request.status !== "confirmed") {
    return fail("VALIDATION", "Bu telafi kaydının son günü bu ekrandan uzatılamaz. Telafi Merkezi'ni yenileyin.");
  }
  next = replaceRequest(next, updated);
  return {
    ok: true,
    data: next,
    requestId: request.id,
    payoutTouches: touches,
    changedLessons: changed,
    notifyCancelled: [],
  };
}

function revisePlan(
  data: AppData,
  request: MakeupRequest,
  op: Extract<MakeupLifecycleOp, { kind: "revise" }>
): MakeupLifecycleResult {
  if (request.status !== "confirmed") {
    return fail("VALIDATION", "Yalnız planlanmış (onaylı) telafi revize edilir. Süresi dolmuş hak için önce son günü uzatın.");
  }
  const plans = activePlanLessons(data, request);
  if (plans.length === 0) {
    return fail("VALIDATION", "Bu hakka bağlı aktif telafi dersi yok. Telafi Merkezi'nden yeniden planlayın.");
  }
  if (plans.length > 1) {
    return fail(
      "CONFLICT",
      "Bu telafi hakkına bağlı birden fazla aktif ders var. Aynı haktan iki ders açık kalamaz; fazladan planı silin, sonra tek dersi revize edin."
    );
  }
  const before = plans[0]!;
  const ack = ackFailure(lessonHasConductMark(before), op, DELETE_ACK.replace("Plan silinirse", "Plan revize edilirse"));
  if (ack) return ack;

  const validation = validateLessonSlot(
    data,
    { ...request, status: "pending" },
    { teacherId: op.teacherId, roomId: op.roomId, startAt: op.startAt },
    {
      now: op.now,
      excludeLessonId: before.id,
      durationMinutes: makeupDurationMinutes(data, request),
      allowAvailabilityOverride: op.allowAvailabilityOverride,
    }
  );
  if (!validation.ok) return fail("VALIDATION", validation.message);

  const after: Lesson = {
    ...before,
    teacherId: validation.slot.teacherId,
    roomId: validation.slot.roomId,
    branchId: validation.slot.branchId,
    startAt: validation.slot.startAt,
    endAt: validation.slot.endAt,
  };
  const from = `${before.startAt}|${before.teacherId}|${before.roomId}`;
  const to = `${after.startAt}|${after.teacherId}|${after.roomId}`;
  let next = replaceLesson(data, after);
  next = replaceRequest(next, {
    ...request,
    teacherId: after.teacherId,
    changeLog: log(request, {
      action: "plan_revised",
      at: op.now.toISOString(),
      by: op.actorUserId,
      from,
      to,
      note: op.correctionNote?.trim() || undefined,
    }),
  });
  return {
    ok: true,
    data: next,
    requestId: request.id,
    payoutTouches: [],
    changedLessons: [{ before, after }],
    notifyCancelled: [],
    rescheduled: before.startAt === after.startAt ? undefined : { before, after },
  };
}

function deletePlan(
  data: AppData,
  request: MakeupRequest,
  op: Extract<MakeupLifecycleOp, { kind: "deletePlan" }>,
  asPartOfCancel = false
): MakeupLifecycleResult {
  const plans = activePlanLessons(data, request);
  if (plans.length === 0) {
    return fail("VALIDATION", "Silinecek planlanmış telafi dersi yok. Hak açıksa Telafi Merkezi'nden yeniden planlayın.");
  }
  const needsAck = plans.some((lesson) => lessonHasConductMark(lesson));
  const ack = ackFailure(needsAck, op, DELETE_ACK);
  if (ack) return ack;

  const touches: { before: Lesson; after: Lesson }[] = [];
  const changed: { before: Lesson; after: Lesson }[] = [];
  let next = data;
  const cancelled: Lesson[] = [];
  for (const before of plans) {
    const after = cancelPlanLesson(before);
    next = replaceLesson(next, after);
    changed.push({ before, after });
    payoutTouch(before, after, touches);
    cancelled.push(after);
  }
  const cleared: MakeupRequest = {
    ...request,
    status: "pending",
    confirmedLessonId: undefined,
    slaDeadline: undefined,
    slaEscalationLevel: 0,
    changeLog: log(request, {
      action: "plan_deleted",
      at: op.now.toISOString(),
      by: op.actorUserId,
      from: plans.map((lesson) => lesson.id).join(","),
      note: op.correctionNote?.trim() || undefined,
    }),
  };
  next = replaceRequest(next, cleared);

  if (!asPartOfCancel && isPastMakeupPlanningDeadline(cleared.expiresAt, op.now)) {
    const expired = applyExpiryToRequest(next, { ...cleared, status: "pending", confirmedLessonId: undefined }, op.now, op.actorUserId);
    if (expired.before && expired.after) {
      changed.push({ before: expired.before, after: expired.after });
      payoutTouch(expired.before, expired.after, touches);
    }
    next = expired.data;
  }

  return {
    ok: true,
    data: next,
    requestId: request.id,
    payoutTouches: touches,
    changedLessons: changed,
    notifyCancelled: cancelled,
  };
}

function cancelRight(
  data: AppData,
  request: MakeupRequest,
  op: Extract<MakeupLifecycleOp, { kind: "cancelRight" }>
): MakeupLifecycleResult {
  const note = op.decisionNote.trim();
  if (!note) {
    return fail("VALIDATION", "Telafi hakkını iptal etmek için gerekçe yazın. Bu not Telafi Merkezi geçmişinde görünür.");
  }
  if (request.status === "cancelled") {
    return fail("VALIDATION", "Bu telafi hakkı zaten iptal. Telafi Merkezi'ni yenileyin.");
  }
  if (request.status === "completed") {
    return fail(
      "VALIDATION",
      "Gerçekleşmiş telafi hakkı sessizce iptal edilmez. Ders kaydı duruyor; düzeltme için plan revizyonunu açık onayla kullanın."
    );
  }
  const plans = activePlanLessons(data, request);
  if (plans.length > 0 && !op.alsoCancelPlan) {
    return fail(
      "ACK_REQUIRED",
      "Bu hakkın planlanmış bir telafi dersi var. Hakkı iptal ederseniz o ders de iptal olur, saati boşalır; kaynak ders silinmez. Devam etmek için planın da kalkacağını onaylayın."
    );
  }
  let next = data;
  let cancelled: Lesson[] = [];
  let touches: { before: Lesson; after: Lesson }[] = [];
  let changed: { before: Lesson; after: Lesson }[] = [];
  if (plans.length > 0) {
    const deleted = deletePlan(data, request, { ...op, kind: "deletePlan" }, true);
    if (!deleted.ok) return deleted;
    next = deleted.data;
    cancelled = deleted.notifyCancelled;
    touches = deleted.payoutTouches;
    changed = deleted.changedLessons;
  }
  const current = next.makeupRequests.find((row) => row.id === request.id) ?? request;
  next = replaceRequest(next, {
    ...current,
    status: "cancelled",
    confirmedLessonId: undefined,
    decisionNote: note,
    decidedBy: op.actorUserId,
    decidedAt: op.now.toISOString(),
    changeLog: log(current, {
      action: "right_cancelled",
      at: op.now.toISOString(),
      by: op.actorUserId,
      note,
    }),
  });
  return {
    ok: true,
    data: next,
    requestId: request.id,
    payoutTouches: touches,
    changedLessons: changed,
    notifyCancelled: cancelled,
  };
}

/** Revizyon/planlama doğrulamasının ihtiyaç duyduğu dar bağlam. Tam `readData` değil. */
export function narrowMakeupBundle(
  data: AppData,
  requestId: string,
  slot?: { teacherId?: string; roomId?: string; startAt?: string }
): AppData | null {
  const request = data.makeupRequests.find((row) => row.id === requestId);
  if (!request) return null;
  const related = data.lessons.filter(
    (lesson) =>
      lesson.id === request.sourceLessonId ||
      lesson.id === request.confirmedLessonId ||
      lesson.makeupRequestId === request.id
  );
  const teacherIds = new Set<string>([request.teacherId, ...related.map((lesson) => lesson.teacherId)]);
  const roomIds = new Set<string>(related.map((lesson) => lesson.roomId));
  if (slot?.teacherId) teacherIds.add(slot.teacherId);
  if (slot?.roomId) roomIds.add(slot.roomId);
  const anchors = [request.expiresAt, ...related.map((lesson) => lesson.startAt), slot?.startAt].filter(
    (value): value is string => !!value
  );
  const inWindow = (iso: string) =>
    anchors.some((anchor) => {
      const day = new Date(anchor);
      const from = day.getTime() - 36 * 3_600_000;
      const to = day.getTime() + 36 * 3_600_000;
      const at = new Date(iso).getTime();
      return at >= from && at <= to;
    });
  const lessons = data.lessons.filter(
    (lesson) =>
      related.some((row) => row.id === lesson.id) ||
      (inWindow(lesson.startAt) &&
        (teacherIds.has(lesson.teacherId) || roomIds.has(lesson.roomId) || lesson.studentId === request.studentId))
  );
  const lessonIds = new Set(lessons.map((lesson) => lesson.id));
  return {
    ...data,
    teachers: data.teachers.filter((teacher) => teacherIds.has(teacher.id)),
    rooms: data.rooms.filter((room) => roomIds.has(room.id)),
    students: data.students.filter((student) => student.id === request.studentId),
    lessons,
    makeupRequests: data.makeupRequests.filter((row) => row.studentId === request.studentId),
    attendances: data.attendances.filter((row) => lessonIds.has(row.lessonId)),
    payments: [],
    teacherFeeRules: [],
    teacherPayouts: [],
    lessonSeries: [],
    packages: [],
    discountCampaigns: [],
  };
}

/** Tam veride çalışır ama kuralı dar dilimde uygular; sonuç tam veriye geri yazılır. */
export function applyMakeupLifecycleOnFull(data: AppData, op: MakeupLifecycleOp): MakeupLifecycleResult {
  const slot =
    op.kind === "revise" ? { teacherId: op.teacherId, roomId: op.roomId, startAt: op.startAt } : undefined;
  const bundle = narrowMakeupBundle(data, op.requestId, slot);
  if (!bundle) {
    return fail("NOT_FOUND", "Telafi talebi bulunamadı. Telafi Merkezi'ni yenileyip kaydın durduğunu kontrol edin.");
  }
  const applied = applyMakeupLifecycle(bundle, op);
  if (!applied.ok) return applied;
  return { ...applied, data: mergeMakeupBundle(data, applied.data) };
}

export function mergeMakeupBundle(full: AppData, bundle: AppData): AppData {
  const lessons = new Map(bundle.lessons.map((lesson) => [lesson.id, lesson]));
  const requests = new Map(bundle.makeupRequests.map((request) => [request.id, request]));
  return {
    ...full,
    lessons: full.lessons.map((lesson) => lessons.get(lesson.id) ?? lesson),
    makeupRequests: full.makeupRequests.map((request) => requests.get(request.id) ?? request),
  };
}

/** Çift plan koruması: aynı hakkın iptal edilmemiş telafi dersi varsa ikinci ders yazılmaz. */
export type { MakeupDecision };
