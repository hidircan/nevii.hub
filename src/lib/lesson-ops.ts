/**
 * Geldi / İşlendi / Telafi / Gelmedi / Mazeretli — ayrı, kalıcı operasyonel
 * bayraklar (tek enum değil), TEK, birbirini dışlayan statü olarak davranır
 * (bkz. switchLessonOpsFlag).
 * - Geldi: öğrenci katıldı; dersi otomatik tamamlamaz ama hakedişe girer (bkz. isLessonProcessedForPayout)
 * - İşlendi: ders fiilen işlendi → hakediş kaynağı (status completed)
 * - Telafi: telafi akışına alındı (kırmızı)
 * - Gelmedi: öğrenci mazeretsiz katılmadı
 * - Mazeretli: öğrenci mazeretle katılmadı (telafi/hakediş kararı yönetici inisiyatifinde)
 *
 * Mali ayrım (Package B): öğrenciler ders başına değil aylık paket ücretiyle
 * ödeme yapar. Geldi/İşlendi/Telafi hiçbir zaman Payment oluşturmaz veya
 * mevcut aylık tutarı değiştirmez — yalnız katılım/telafi operasyonunu
 * yönetir. Aylık ücret `monthly_plan` kaynağıyla (bkz.
 * `setMonthlyPlanAmountTool`) ayrı, bağımsız olarak yönetilir. Daha önce
 * (Package B öncesi) otomatik oluşmuş `source:"lesson_ops"` Payment kayıtları
 * geçmiş/muhasebe verisi olarak DOKUNULMADAN okunabilir kalır; bu dosya
 * artık yeni böyle bir kayıt YARATMAZ.
 */

import { buildDisruptionPatch, type LessonDisruptionInput, type LessonDisruptionPatch } from "./lesson-disruption";
import type { AppData, Attendance, Lesson, MakeupRequest } from "./types";
import { uid } from "./utils";
import { reoccupyBlockMessage } from "./lesson-occupancy";
import { addDays, formatISO } from "date-fns";
import { assertCanCreateMakeup } from "./makeup-quota";
import { closedMakeupToReopen, reopenMakeupRequest } from "./makeup-deadline";

export type LessonOpsFlag = "attended" | "processed" | "makeup" | "absent" | "excused";

export type LessonOpsPatch = Partial<
  Pick<
    Lesson,
    | "studentAttended"
    | "studentAttendedAt"
    | "studentAttendedBy"
    | "lessonProcessed"
    | "lessonProcessedAt"
    | "lessonProcessedBy"
    | "lessonProcessedReason"
    | "opsMakeupFlag"
    | "opsMakeupFlagAt"
    | "opsMakeupFlagBy"
    | "studentAbsent"
    | "studentAbsentAt"
    | "studentAbsentBy"
    | "studentExcused"
    | "studentExcusedAt"
    | "studentExcusedBy"
    | "status"
    | "actualEndAt"
  >
>;

export type ApplyLessonOpsResult =
  | {
      ok: true;
      alreadySet: boolean;
      data: AppData;
      lesson: Lesson;
      message: string;
    }
  | { ok: false; message: string };

/**
 * Hakediş kaynağı — ders fiilen verildi mi? (owner kararı 2026-09-30)
 * İşlendi, Geldi veya tamamlanmış ("Dersi bitir") ders sayılır; Telafi/Gelmedi/Mazeretli ve iptal sayılmaz.
 *
 * KÖK NEDEN: statüler birbirini dışlayınca (c21e72b) "Geldi" seçilen ders hiç İşlendi olamıyordu ve
 * hakedişten sessizce düşüyordu; ayrıca DB'de `lessonProcessed` varsayılanı `false` olduğundan
 * `completed` dersler json modda sayılıp db modda sayılmıyordu (mode parity ihlali).
 */
export function isLessonProcessedForPayout(
  lesson: Pick<Lesson, "status" | "lessonProcessed" | "studentAttended" | "opsMakeupFlag" | "studentAbsent" | "studentExcused">
): boolean {
  if (lesson.lessonProcessed === true) return true;
  if (lesson.opsMakeupFlag || lesson.studentAbsent || lesson.studentExcused) return false;
  if (lesson.status === "cancelled" || lesson.status === "no_show") return false;
  return lesson.studentAttended === true || lesson.status === "completed";
}

/** Boş/yalnızca-boşluk gerekçeyi de reddeder — "gerekçesiz" ile aynı muamele. */
function isBlankReason(reason?: string): boolean {
  return !reason || reason.trim().length === 0;
}

function applyLessonOpsFlagUnguarded(
  data: AppData,
  lessonId: string,
  flag: LessonOpsFlag,
  actorUserId: string,
  now: Date = new Date(),
  reason?: string,
  disruption?: LessonDisruptionInput,
  attendanceNote?: string | null
): ApplyLessonOpsResult {
  const lesson = data.lessons.find((l) => l.id === lessonId);
  if (!lesson) return { ok: false, message: "Ders bulunamadı." };

  // P0-2 — "İşlendi" ve "Telafi" zorunlu, gerçek kullanıcı gerekçesi ister;
  // boş/yalnız-boşluk gerekçe de reddedilir. Diğer bayraklar (Geldi/Gelmedi/
  // Mazeretli) etkilenmez.
  if ((flag === "processed" || flag === "makeup") && isBlankReason(reason)) {
    const label = flag === "processed" ? "İşlendi" : "Telafi";
    return { ok: false, message: `"${label}" olarak işaretlemek için gerekçe zorunludur.` };
  }

  const nowIso = now.toISOString();

  if (flag === "attended") {
    if (lesson.studentAttended) {
      return {
        ok: true,
        alreadySet: true,
        data,
        lesson,
        message: "Geldi zaten işaretli.",
      };
    }
    const patch: LessonOpsPatch = {
      studentAttended: true,
      studentAttendedAt: nowIso,
      studentAttendedBy: actorUserId,
    };
    let attendances = data.attendances.filter((a) => a.lessonId !== lessonId);
    const attendance: Attendance = {
      id: uid("att"),
      lessonId,
      studentId: lesson.studentId,
      status: "present",
      markedAt: nowIso,
      createsMakeupCredit: false,
    };
    attendances = [...attendances, attendance];
    const lessons = data.lessons.map((l) =>
      l.id === lessonId
        ? { ...l, ...patch, ...(attendanceNote !== undefined ? { studentAttendanceNote: attendanceNote } : {}) }
        : l
    );
    const next = { ...data, lessons, attendances };
    const nextLesson = lessons.find((l) => l.id === lessonId)!;
    return {
      ok: true,
      alreadySet: false,
      data: next,
      lesson: nextLesson,
      message: attendanceNote ? "Geldi işaretlendi. Not kaydedildi." : "Geldi işaretlendi.",
    };
  }

  if (flag === "processed") {
    if (lesson.lessonProcessed && lesson.status === "completed") {
      return {
        ok: true,
        alreadySet: true,
        data,
        lesson,
        message: "İşlendi zaten işaretli.",
      };
    }
    const patch: LessonOpsPatch = {
      lessonProcessed: true,
      lessonProcessedAt: nowIso,
      lessonProcessedBy: actorUserId,
      lessonProcessedReason: reason!.trim(),
      status: "completed",
      actualEndAt: lesson.actualEndAt ?? nowIso,
    };
    const lessons = data.lessons.map((l) => (l.id === lessonId ? { ...l, ...patch } : l));
    const next = { ...data, lessons };
    const nextLesson = lessons.find((l) => l.id === lessonId)!;
    return {
      ok: true,
      alreadySet: false,
      data: next,
      lesson: nextLesson,
      message: "İşlendi işaretlendi.",
    };
  }

  if (flag === "absent") {
    if (lesson.studentAbsent) {
      return { ok: true, alreadySet: true, data, lesson, message: "Gelmedi zaten işaretli." };
    }
    const patch: LessonOpsPatch = {
      studentAbsent: true,
      studentAbsentAt: nowIso,
      studentAbsentBy: actorUserId,
    };
    const lessons = data.lessons.map((l) => (l.id === lessonId ? { ...l, ...patch } : l));
    const next = { ...data, lessons };
    const nextLesson = lessons.find((l) => l.id === lessonId)!;
    return { ok: true, alreadySet: false, data: next, lesson: nextLesson, message: "Gelmedi işaretlendi." };
  }

  if (flag === "excused") {
    if (lesson.studentExcused) {
      return { ok: true, alreadySet: true, data, lesson, message: "Mazeretli zaten işaretli." };
    }
    const patch: LessonOpsPatch = {
      studentExcused: true,
      studentExcusedAt: nowIso,
      studentExcusedBy: actorUserId,
    };
    const lessons = data.lessons.map((l) => (l.id === lessonId ? { ...l, ...patch } : l));
    const next = { ...data, lessons };
    const nextLesson = lessons.find((l) => l.id === lessonId)!;
    return { ok: true, alreadySet: false, data: next, lesson: nextLesson, message: "Mazeretli işaretlendi." };
  }

  // makeup
  if (lesson.opsMakeupFlag) {
    return {
      ok: true,
      alreadySet: true,
      data,
      lesson,
      message: "Telafi zaten işaretli.",
    };
  }
  const patch: LessonOpsPatch & Partial<LessonDisruptionPatch> = {
    opsMakeupFlag: true,
    opsMakeupFlagAt: nowIso,
    opsMakeupFlagBy: actorUserId,
    // 9. tur — kaynak aynı yamada: kota kontrolü (öğretmen/kurum kaynaklıysa muaf) bunu görür.
    ...(disruption ? buildDisruptionPatch(disruption, actorUserId, now) : {}),
  };
  const lessons = data.lessons.map((l) => (l.id === lessonId ? { ...l, ...patch } : l));

  let makeupRequests = data.makeupRequests;
  let attendances = data.attendances;
  const existingMk = makeupRequests.find(
    (m) => m.sourceLessonId === lessonId && m.status !== "cancelled" && m.status !== "expired"
  );
  // 2026-10-06 (owner) — kulüp oturumunda öğrenci bazında Telafi yalnız statüdür; bireysel telafi talebi/kota
  // YOK. Oturumun tamamı ertelenecekse kulüp oturum ekranındaki "Oturumu ertele" kullanılır.
  if (!existingMk && lesson.type !== "group") {
    const quota = assertCanCreateMakeup({ ...data, lessons }, lesson.studentId, now, lesson.id);
    if (!quota.ok) return { ok: false, message: quota.message };
    const branch = data.settings.branches.find((b) => b.id === lesson.branchId);
    /**
     * 2026-10-15 — Telafi → Geri al/hak iptali → yeniden Telafi: ders başına tek yoklama, yoklama başına tek telafi
     * talebi (şemada ikisi de @unique). İkinci talep açılamaz; kapanmış talep YENİDEN AÇILIR. Eskiden burada aynı
     * yoklamaya ikinci talep kuruluyordu: db modunda hiç yazılmıyordu (ders "Telafi" görünüyor, Telafi Merkezi'nde
     * açık talep yok), ders silme ise kapanmış eski talebi "bağlı telafi var" diye engelliyordu.
     */
    const closed = closedMakeupToReopen(data, lessonId);
    if (closed) {
      makeupRequests = makeupRequests.map((m) =>
        m.id === closed.id
          ? reopenMakeupRequest(m, { reason: reason!.trim(), now, actorUserId, windowDays: data.settings.makeupWindowDays })
          : m
      );
      const next = { ...data, lessons, makeupRequests, attendances };
      return { ok: true, alreadySet: false, data: next, lesson: lessons.find((l) => l.id === lessonId)!, message: "Telafi işaretlendi." };
    }
    /**
     * `MakeupRequest.attendanceId` GERÇEK bir `Attendance` kaydına işaret
     * ETMELİDİR (şemada zorunlu FK + @unique). Burada eskiden yoklama kaydı
     * yoksa `uid("att")` ile HİÇBİR kayda karşılık gelmeyen bir id
     * uyduruluyordu: json/memory modda referans denetlenmediği için sessizce
     * "çalışıyor" görünüyor, STORE_MODE=db altında ise
     * `MakeupRequest_attendanceId_fkey` ihlaliyle "Telafi" işaretleme TAMAMEN
     * kırılıyordu. Yoklama yoksa artık gerçekten oluşturulur — telafi işareti
     * zaten "öğrenci gelmedi ve hakkı doğdu" demektir.
     */
    let attendance = attendances.find((a) => a.lessonId === lessonId);
    if (!attendance) {
      attendance = {
        id: uid("att"),
        lessonId,
        studentId: lesson.studentId,
        status: "absent",
        markedAt: nowIso,
        createsMakeupCredit: true,
      };
      attendances = [...attendances, attendance];
    }
    const req: MakeupRequest = {
      id: uid("mk"),
      studentId: lesson.studentId,
      teacherId: lesson.teacherId,
      branchId: lesson.branchId,
      instrument: lesson.instrument,
      sourceLessonId: lesson.id,
      attendanceId: attendance.id,
      status: "pending",
      reason: reason!.trim(),
      expiresAt: formatISO(addDays(now, data.settings.makeupWindowDays)),
      suggestedSlots: [],
      createdAt: nowIso,
      policyNote: `${data.settings.makeupWindowDays} gün pencere · ${data.settings.monthlyMakeupAllowance ?? 2}/dönem hak · ${branch?.shortName ?? ""}`,
    };
    makeupRequests = [...makeupRequests, req];
  }

  const next = { ...data, lessons, makeupRequests, attendances };
  const nextLesson = lessons.find((l) => l.id === lessonId)!;
  // Telafi işareti hiçbir zaman mali sonuç doğurmaz (Package B) — öğrenci
  // aylık paket ücretiyle öder, ders/telafi bazlı otomatik tahsilat yok.
  return {
    ok: true,
    alreadySet: false,
    data: next,
    lesson: nextLesson,
    message: "Telafi işaretlendi.",
  };
}

/** Bir dersin operasyonel tek statüsü — öncelik: Telafi > İşlendi > Geldi > Gelmedi > Mazeretli. */
export function effectiveLessonOpsStatus(
  lesson: Pick<Lesson, "studentAttended" | "lessonProcessed" | "opsMakeupFlag" | "studentAbsent" | "studentExcused">
): LessonOpsFlag | null {
  if (lesson.opsMakeupFlag) return "makeup";
  if (lesson.lessonProcessed) return "processed";
  if (lesson.studentAttended) return "attended";
  if (lesson.studentAbsent) return "absent";
  if (lesson.studentExcused) return "excused";
  return null;
}

/**
 * ÖNCELİK 4 (devam) — Geldi/İşlendi/Telafi'yi TEK, birbirini dışlayan bir
 * statü olarak davranmasını sağlar. Halihazırda farklı bir statü etkinse
 * (`effectiveLessonOpsStatus` ile), önce O statünün bayrağını (ve varsa
 * diğerlerini) TEMİZLER, sonra istenen bayrağı `applyLessonOpsFlag` ile —
 * DEĞİŞMEDEN — set eder. Hiçbir dal Payment oluşturmaz/değiştirmez (Package
 * B); daha önce (Package B öncesi) oluşmuş `source:"lesson_ops"` geçmiş
 * kayıtlar burada asla dokunulmaz — yalnızca ders iptali
 * (`applyLessonCancel`) hâlâ ödenmemiş geçmiş bir kaydı void'e çevirebilir.
 */
function switchLessonOpsFlagUnguarded(
  data: AppData,
  lessonId: string,
  flag: LessonOpsFlag,
  actorUserId: string,
  now: Date = new Date(),
  reason?: string,
  disruption?: LessonDisruptionInput,
  attendanceNote?: string | null
): ApplyLessonOpsResult {
  const lesson = data.lessons.find((l) => l.id === lessonId);
  if (!lesson) return { ok: false, message: "Ders bulunamadı." };

  const current = effectiveLessonOpsStatus(lesson);
  if (current === flag) {
    // Zaten bu statüde — applyLessonOpsFlag kendi "alreadySet" mesajını üretir.
    return applyLessonOpsFlag(data, lessonId, flag, actorUserId, now, reason, disruption, attendanceNote);
  }
  if (current === null) {
    // Hiçbir statü etkin değil — ilk tıklama, doğrudan set.
    return applyLessonOpsFlag(data, lessonId, flag, actorUserId, now, reason, disruption, attendanceNote);
  }

  // Farklı bir statüden geçiş — önce diğer bayrakları temizle (mali kayıt DOKUNULMAZ).
  const cleared: Lesson = {
    ...lesson,
    studentAttended: false,
    studentAttendedAt: undefined,
    studentAttendedBy: undefined,
    lessonProcessed: false,
    lessonProcessedAt: undefined,
    lessonProcessedBy: undefined,
    lessonProcessedReason: undefined,
    opsMakeupFlag: false,
    opsMakeupFlagAt: undefined,
    opsMakeupFlagBy: undefined,
    studentAbsent: false,
    studentAbsentAt: undefined,
    studentAbsentBy: undefined,
    studentExcused: false,
    studentExcusedAt: undefined,
    studentExcusedBy: undefined,
  };
  const clearedData: AppData = {
    ...data,
    lessons: data.lessons.map((l) => (l.id === lessonId ? cleared : l)),
  };
  return applyLessonOpsFlag(clearedData, lessonId, flag, actorUserId, now, reason, disruption, attendanceNote);
}

export type ClearLessonOpsResult =
  | {
      ok: true;
      /** Ders zaten statüsüzdü (ör. çift tıklamanın ikinci isteği) — hiçbir şey yazılmadı. */
      alreadyClear: boolean;
      data: AppData;
      lesson: Lesson;
      cleared: LessonOpsFlag | null;
      cancelledMakeupIds: string[];
      removedAttendanceIds: string[];
      message: string;
    }
  | { ok: false; code: "NOT_FOUND" | "STALE" | "MAKEUP_IN_USE" | "SLOT_TAKEN"; message: string };

export const OPS_LABEL: Record<LessonOpsFlag, string> = {
  attended: "Geldi",
  processed: "İşlendi",
  makeup: "Telafi",
  absent: "Gelmedi",
  excused: "Mazeretli",
};

/**
 * 2026-09-29 — işaretli yoklama statüsünü GERİ ALIR (ders statüsüz/planlı haline döner).
 * - `expected`: kullanıcının ekranda gördüğü statü. Sunucudaki statü farklıysa (başka biri değiştirdi)
 *   hiçbir şey yazılmaz → STALE. Statü zaten yoksa idempotent no-op (çift tıklama güvenli).
 * - İşlendi: `completed` → `scheduled`; hakediş dışına çıkar (hakediş kaydı kilidi tool katmanında).
 * - Telafi: bekleyen telafi talebi iptal edilir (kota iade olur). Telafi dersi planlanmış/yapılmışsa
 *   geri alma reddedilir — önce Telafi ekranından o ders iptal edilmeli.
 * - Dersin yoklama satırları silinir (bir telafi talebi ona bağlı değilse — iptal edilen talebin
 *   FK çapası geçmiş kaydı olarak kalır). Yalnız "Geldi"nin satırını silmek yetmiyordu: Geldi → Gelmedi
 *   geçişinde "present" satırı kalıyor, geri almadan sonra ders "yoklama kaydı var" diye kilitleniyordu.
 * Hiçbir dal Payment oluşturmaz/değiştirmez (Package B).
 */
function clearLessonOpsFlagUnguarded(
  data: AppData,
  lessonId: string,
  expected: LessonOpsFlag,
  actorUserId: string,
  now: Date = new Date()
): ClearLessonOpsResult {
  const lesson = data.lessons.find((l) => l.id === lessonId);
  if (!lesson) return { ok: false, code: "NOT_FOUND", message: "Ders bulunamadı. Sayfayı yenileyip tekrar deneyin." };
  const current = effectiveLessonOpsStatus(lesson);
  if (current === null) {
    return {
      ok: true,
      alreadyClear: true,
      data,
      lesson,
      cleared: null,
      cancelledMakeupIds: [],
      removedAttendanceIds: [],
      message: "Bu dersin yoklama statüsü zaten boş.",
    };
  }
  if (current !== expected) {
    return {
      ok: false,
      code: "STALE",
      message: `Bu ders artık "${OPS_LABEL[current]}" olarak işaretli (ekranınızda "${OPS_LABEL[expected]}" görünüyordu). Sayfayı yenileyip güncel statüyü kontrol edin.`,
    };
  }

  const nowIso = now.toISOString();
  let makeupRequests = data.makeupRequests;
  const cancelledMakeupIds: string[] = [];
  if (current === "makeup") {
    const active = makeupRequests.filter(
      (m) => m.sourceLessonId === lessonId && m.status !== "cancelled" && m.status !== "expired"
    );
    const inUse = active.find((m) => m.status === "confirmed" || m.status === "completed" || m.confirmedLessonId);
    if (inUse) {
      return {
        ok: false,
        code: "MAKEUP_IN_USE",
        message:
          "Bu telafi için telafi dersi planlanmış veya yapılmış; Telafi statüsü doğrudan geri alınamaz. Önce Telafi ekranından planlanan telafi dersini iptal edin, sonra tekrar deneyin.",
      };
    }
    const ids = new Set(active.map((m) => m.id));
    cancelledMakeupIds.push(...ids);
    makeupRequests = makeupRequests.map((m) =>
      ids.has(m.id)
        ? { ...m, status: "cancelled", decisionNote: "Yoklama statüsü geri alındı", decidedBy: actorUserId, decidedAt: nowIso }
        : m
    );
  }

  let attendances = data.attendances;
  const removedAttendanceIds: string[] = [];
  const referenced = new Set(makeupRequests.map((m) => m.attendanceId));
  for (const a of attendances) {
    if (a.lessonId === lessonId && !referenced.has(a.id)) removedAttendanceIds.push(a.id);
  }
  attendances = attendances.filter((a) => !removedAttendanceIds.includes(a.id));

  const wasProcessed = current === "processed";
  const cleared: Lesson = {
    ...lesson,
    studentAttended: false,
    studentAttendedAt: undefined,
    studentAttendedBy: undefined,
    lessonProcessed: false,
    lessonProcessedAt: undefined,
    lessonProcessedBy: undefined,
    lessonProcessedReason: undefined,
    opsMakeupFlag: false,
    opsMakeupFlagAt: undefined,
    opsMakeupFlagBy: undefined,
    studentAbsent: false,
    studentAbsentAt: undefined,
    studentAbsentBy: undefined,
    studentExcused: false,
    studentExcusedAt: undefined,
    studentExcusedBy: undefined,
    ...(wasProcessed && lesson.status === "completed" ? { status: "scheduled" as const } : {}),
    // İşlendi'nin kendisinin yazdığı bitiş zamanı geri alınır; önceden girilmiş gerçek bitiş korunur.
    ...(wasProcessed && lesson.actualEndAt && lesson.actualEndAt === lesson.lessonProcessedAt ? { actualEndAt: undefined } : {}),
  };
  const lessons = data.lessons.map((l) => (l.id === lessonId ? cleared : l));
  return {
    ok: true,
    alreadyClear: false,
    data: { ...data, lessons, makeupRequests, attendances },
    lesson: cleared,
    cleared: current,
    cancelledMakeupIds,
    removedAttendanceIds,
    message: `"${OPS_LABEL[current]}" statüsü geri alındı.`,
  };
}

/**
 * 2026-10-03 (owner) — Telafi'ye alınan dersin saati başka derse verilebilir (bkz. lesson-occupancy.ts).
 * Statü değişimi/geri alma dersi saatine yeniden "oturtuyorsa" ve saat bu arada dolduysa işlem engellenir;
 * üç store da bu saf fonksiyonları kullandığı için kural her modda aynı.
 */
function slotTakenMessageFor(data: AppData, lessonId: string, after: Lesson, action: string): string | null {
  const before = data.lessons.find((l) => l.id === lessonId);
  return before ? reoccupyBlockMessage(data, before, after, action) : null;
}

export function applyLessonOpsFlag(...args: Parameters<typeof applyLessonOpsFlagUnguarded>): ApplyLessonOpsResult {
  const result = applyLessonOpsFlagUnguarded(...args);
  const blocked = result.ok && !result.alreadySet ? slotTakenMessageFor(args[0], args[1], result.lesson, "Statü değiştirilemedi") : null;
  return blocked ? { ok: false, message: blocked } : result;
}

export function switchLessonOpsFlag(...args: Parameters<typeof switchLessonOpsFlagUnguarded>): ApplyLessonOpsResult {
  const result = switchLessonOpsFlagUnguarded(...args);
  const blocked = result.ok && !result.alreadySet ? slotTakenMessageFor(args[0], args[1], result.lesson, "Statü değiştirilemedi") : null;
  return blocked ? { ok: false, message: blocked } : result;
}

export function clearLessonOpsFlag(...args: Parameters<typeof clearLessonOpsFlagUnguarded>): ClearLessonOpsResult {
  const result = clearLessonOpsFlagUnguarded(...args);
  const blocked = result.ok && !result.alreadyClear ? slotTakenMessageFor(args[0], args[1], result.lesson, "Statü geri alınamadı") : null;
  return blocked ? { ok: false, code: "SLOT_TAKEN", message: blocked } : result;
}
