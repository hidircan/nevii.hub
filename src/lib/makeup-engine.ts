import { addDays, addMinutes, differenceInCalendarDays, isBefore, isAfter, parseISO } from "date-fns";
import type {
  StudentTermType,
  AppData,
  BranchId,
  Instrument,
  Lesson,
  MakeupRequest,
  MakeupSlot,
  MakeupStatus,
  Room,
  Teacher,
} from "./types";
import { availabilityForBranch, isTeacherSchedulable, teacherServesBranch } from "./teacher-branches";
import { DEFAULT_APP_TIMEZONE, addDaysYmd, toZonedYmd, zonedHm, zonedWallTimeToUtc, zonedWeekday } from "./timezone";
import { assertWorkDaySchedulable, isSuggestableWorkDay, type DayStatusReason } from "./work-days";
import { buildTeacherDayAvailability, nearestFreeStart, slotAdvice } from "./teacher-day-availability";
import { lessonOccupiesSlot } from "./lesson-occupancy";

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

/** Ders yazılabilir oda: aktif ve silinmemiş (legacy `active` yoksa aktif). */
export function isRoomSchedulable(room: Pick<Room, "active" | "deletedAt">): boolean {
  return room.active !== false && !room.deletedAt;
}

function roomSupports(room: Room, instrument: string) {
  return room.instruments.includes(instrument as Room["instruments"][number]);
}

/**
 * 8. tur (G) — PERFORMANS KÖK NEDENİ: öneri motorları (telafi, "Uygun saatleri bul",
 * seri önizleme, CSV) `validateLessonSlot`'u binlerce kez çağırır; her çağrı TÜM
 * dersleri 4 kez tarayıp her satırda `parseISO` yapıyordu → O(aday × ders).
 * Ölçüm (6000 ders, 8 öğretmen, 6 oda): telafi önerisi 41 sn.
 * Çözüm: ders listesi başına BİR kez kurulan indeks (öğretmen/oda/öğrenci → sayısal
 * aralıklar; yalnız saati GERÇEKTEN dolduran dersler — tek kural `lessonOccupiesSlot`: iptal ve
 * Telafi'ye alınmış, yapılmamış ders girmez). Anahtar dizi kimliği + uzunluk: store her yazmada yeni
 * dizi üretir. ponytail: aynı dizide yerinde eleman değişimi indeksi bayatlatır —
 * böyle bir çağıran çıkarsa `lessonIndex.delete(lessons)` ile açıkça geçersiz kılın.
 */
type LessonSpan = { id: string; start: number; end: number; ymd: string };
type LessonIndex = { len: number; byTeacher: Map<string, LessonSpan[]>; byRoom: Map<string, LessonSpan[]>; byStudent: Map<string, LessonSpan[]> };
const lessonIndex = new WeakMap<Lesson[], LessonIndex>();

function indexOf(lessons: Lesson[]): LessonIndex {
  const hit = lessonIndex.get(lessons);
  if (hit && hit.len === lessons.length) return hit;
  const idx: LessonIndex = { len: lessons.length, byTeacher: new Map(), byRoom: new Map(), byStudent: new Map() };
  const push = (map: Map<string, LessonSpan[]>, key: string, span: LessonSpan) => {
    const list = map.get(key);
    if (list) list.push(span);
    else map.set(key, [span]);
  };
  for (const l of lessons) {
    if (!lessonOccupiesSlot(l)) continue;
    const start = parseISO(l.startAt);
    const span = { id: l.id, start: start.getTime(), end: parseISO(l.endAt).getTime(), ymd: toZonedYmd(start, DEFAULT_APP_TIMEZONE) };
    push(idx.byTeacher, l.teacherId, span);
    push(idx.byRoom, l.roomId, span);
    push(idx.byStudent, l.studentId, span);
  }
  lessonIndex.set(lessons, idx);
  return idx;
}

function busy(list: LessonSpan[] | undefined, start: Date, end: Date, excludeLessonId?: string) {
  const s = start.getTime();
  const e = end.getTime();
  return !!list?.some((l) => l.id !== excludeLessonId && s < l.end && l.start < e);
}

function teacherFree(teacherId: string, start: Date, end: Date, lessons: Lesson[], excludeLessonId?: string) {
  return !busy(indexOf(lessons).byTeacher.get(teacherId), start, end, excludeLessonId);
}

function roomFree(roomId: string, start: Date, end: Date, lessons: Lesson[], excludeLessonId?: string) {
  return !busy(indexOf(lessons).byRoom.get(roomId), start, end, excludeLessonId);
}

/**
 * Müsaitlik penceresi ("10:00–18:00") kurum saat dilimindeki duvar saatidir;
 * gün ve pencere sınırları `zonedWallTimeToUtc` ile çözülür. Önceden
 * `setHours(startOfDay(day))` sunucu saatini kullanıyordu → UTC sunucuda
 * pencere 3 saat kayık değerlendiriliyordu.
 */
function teacherAvailableOnDay(teacher: Teacher, start: Date, end: Date, branchId: BranchId) {
  const ymd = toZonedYmd(start, DEFAULT_APP_TIMEZONE);
  const dow = zonedWeekday(start);
  const windows = availabilityForBranch(teacher.availability, branchId).filter((a) => a.dayOfWeek === dow);
  if (!windows.length) return false;
  return windows.some((w) => {
    const winStart = zonedWallTimeToUtc(ymd, w.start);
    const winEnd = zonedWallTimeToUtc(ymd, w.end);
    return !isBefore(start, winStart) && !isAfter(end, winEnd);
  });
}

function dailyLessonCount(teacherId: string, day: Date, lessons: Lesson[], excludeLessonId?: string) {
  const ymd = toZonedYmd(day, DEFAULT_APP_TIMEZONE);
  return (indexOf(lessons).byTeacher.get(teacherId) ?? []).filter((l) => l.ymd === ymd && l.id !== excludeLessonId).length;
}

export type SlotValidationCode =
  | "REQUEST_NOT_OPEN"
  /** Talebin son kullanım anı geçti — geçmiş tarihe planlama da yapılamaz (owner kararı 2026-09-30). */
  | "REQUEST_EXPIRED"
  | "INVALID_START"
  | "INVALID_DURATION"
  | "PAST_START"
  | "AFTER_EXPIRY"
  | "TEACHER_NOT_FOUND"
  | "TEACHER_INACTIVE"
  | "TEACHER_INSTRUMENT_MISMATCH"
  | "TEACHER_UNAVAILABLE"
  | "TEACHER_CONFLICT"
  | "TEACHER_DAILY_LIMIT"
  | "ROOM_NOT_FOUND"
  /** Oda pasif/silinmiş — öneri de kayıt da reddeder (2026-09-30 kök neden: telafi pasif odaya yazılıyordu). */
  | "ROOM_INACTIVE"
  | "ROOM_INSTRUMENT_MISMATCH"
  | "ROOM_BRANCH_MISMATCH"
  | "ROOM_CONFLICT"
  | "STUDENT_CONFLICT"
  /** Gün kapalı — resmî tatil, dönemin haftalık kapalı günü VEYA yöneticinin "zorla kapalı" istisnası. */
  | "DAY_CLOSED";

export const SLOT_ERROR_MESSAGES: Record<SlotValidationCode, string> = {
  REQUEST_NOT_OPEN: "Bu telafi talebi zaten sonuçlandırılmış.",
  REQUEST_EXPIRED:
    "Bu telafi talebinin son kullanım tarihi geçmiş; süresi dolmuş talep planlanamaz. Gerekirse talebi iptal edip yeni telafi hakkı açın.",
  INVALID_START: "Geçerli bir tarih ve saat seçin.",
  INVALID_DURATION: "Ders süresi en az 30 dakika olmalı.",
  PAST_START: "Başlangıç saati geçmişte olamaz.",
  AFTER_EXPIRY: "Ders, telafi son kullanım tarihini aşıyor.",
  TEACHER_NOT_FOUND: "Seçilen öğretmen bulunamadı.",
  TEACHER_INACTIVE: "Seçilen öğretmen aktif değil.",
  TEACHER_INSTRUMENT_MISMATCH: "Seçilen öğretmen bu enstrümanı vermiyor.",
  TEACHER_UNAVAILABLE: "Öğretmen bu saatte müsait değil.",
  TEACHER_CONFLICT: "Öğretmenin bu saatte başka bir dersi var.",
  TEACHER_DAILY_LIMIT: "Öğretmenin günlük ders limiti doldu.",
  ROOM_NOT_FOUND: "Seçilen oda bulunamadı.",
  ROOM_INACTIVE: "Seçilen oda pasif; bu odaya ders planlanamaz. Başka bir oda seçin veya Odalar ekranından odayı yeniden aktif edin.",
  ROOM_INSTRUMENT_MISMATCH: "Seçilen oda bu enstrümana uygun değil.",
  ROOM_BRANCH_MISMATCH: "Oda, öğretmenin şubesiyle uyumsuz.",
  ROOM_CONFLICT: "Odanın bu saatte başka bir dersi var.",
  STUDENT_CONFLICT: "Öğrencinin bu saatte başka bir dersi var.",
  DAY_CLOSED: "Kurum bu gün kapalı; ders planlanamaz. Başka bir gün seçin.",
};

export type ValidatedSlot = {
  startAt: string;
  endAt: string;
  teacherId: string;
  roomId: string;
  branchId: BranchId;
  /**
   * İş 3 — öğretmen bu saatte kendi bildirdiği çalışma saatleri DIŞINDA ama
   * çağıran taraf `allowAvailabilityOverride` ile bunu bilinçli kabul etti.
   * Yalnızca TEACHER_UNAVAILABLE için mümkündür — diğer tüm ihlaller
   * (çakışma, enstrüman uyumsuzluğu, pasif öğretmen vb.) HER ZAMAN hard
   * block'tur, hiçbir override bunları atlatamaz.
   */
  availabilityOverridden?: boolean;
};

type SlotValidationResult =
  | { ok: true; slot: ValidatedSlot }
  | {
      ok: false;
      code: SlotValidationCode;
      message: string;
      /**
       * Yalnız `DAY_CLOSED` için dolu: günün NEDEN kapalı olduğu. Seri
       * planlama bunu kullanır — tek seferlik bir kapanış (resmî tatil,
       * yöneticinin o güne özel kapatması) ATLANIR, ama haftanın o gününün
       * kurumsal kapalı günü olması (`term_weekly_closed`) yapısal bir
       * hatadır: her oluşum kapalıya düşer, bu yüzden seri baştan reddedilir.
       */
      dayReason?: DayStatusReason;
    };

/**
 * `SlotValidationCode` içinden yalnızca TEACHER_UNAVAILABLE "soft warning" —
 * kullanıcı açıkça onaylarsa planlamaya devam edilebilir. Listedeki her
 * diğer kod (çakışma, enstrüman/oda uyumsuzluğu, pasif öğretmen, geçmiş
 * tarih vb.) veri tutarsızlığı yaratacağı veya teknik olarak imkansız
 * olduğu için HER ZAMAN hard block'tur.
 */
export const OVERRIDABLE_SLOT_CODES: readonly SlotValidationCode[] = ["TEACHER_UNAVAILABLE"];

export function isOverridableSlotCode(code: SlotValidationCode): boolean {
  return (OVERRIDABLE_SLOT_CODES as readonly string[]).includes(code);
}

/**
 * 2026-10-04 KÖK NEDEN ("telafide öğretmen müsaitliği yanlış okunuyor"): telafi doğrulaması ve önerisi
 * dersin GERÇEK süresi yerine kurumun varsayılan ders süresini (`settings.lessonDurationMinutes`)
 * kullanıyordu — 30 dk'lık bir dersin telafisi 50 dk gibi denetlenip pencereden taşıyor ("müsait değil"),
 * ya da tersi kısa sayılıp gerçek çakışma kaçıyordu. Telafi dersi, kaynak (kaçan) dersin süresindedir;
 * kaynak ders bulunamazsa öğrencinin kayıtlı ders süresi, o da yoksa kurum varsayılanı.
 */
export function makeupDurationMinutes(
  data: Pick<AppData, "lessons" | "settings"> & { students?: AppData["students"] },
  request: Pick<MakeupRequest, "sourceLessonId" | "studentId">
): number {
  const source = data.lessons.find((l) => l.id === request.sourceLessonId);
  if (source) {
    const minutes = Math.round((parseISO(source.endAt).getTime() - parseISO(source.startAt).getTime()) / 60_000);
    if (Number.isFinite(minutes) && minutes >= 30) return minutes;
  }
  const studentMinutes = data.students?.find((s) => s.id === request.studentId)?.lessonDurationMinutes;
  if (studentMinutes && studentMinutes >= 30) return studentMinutes;
  return data.settings.lessonDurationMinutes;
}

/** `addLesson`/`createLessonTool` zincirinde yapılandırılmış hata — hangi kuralın hangi kod ile ihlal edildiğini korur (mesaj string'ini ayrıştırmaya gerek kalmaz). */
export class LessonSlotValidationError extends Error {
  code: SlotValidationCode;
  constructor(code: SlotValidationCode, message: string) {
    super(message);
    this.name = "LessonSlotValidationError";
    this.code = code;
  }
}

/**
 * Doğrulama için gerekli en küçük bağlam. Bir telafi talebi (MakeupRequest)
 * bunun bir üst kümesidir, bu yüzden mevcut telafi çağrıları değişmeden
 * çalışır. `status`/`expiresAt` verilmezse o kurallar atlanır — bu, telafi
 * dışı (ör. ilk ders planlama) çağrılar içindir.
 */
export type SlotValidationContext = {
  instrument: Instrument;
  studentId: string;
  status?: MakeupStatus;
  expiresAt?: string;
  /**
   * 2026-09-20 — dersin AKADEMİK DÖNEMİ. Haftalık kapalı gün kuralı döneme
   * bağlıdır (Güz: Pazartesi, Yaz: hafta sonu) ve bir dersin dönemi
   * öğrencinin varsayılan `termType`'ından FARKLI olabilir (ör. güz kayıtlı
   * bir öğrenciye yaz dersi planlamak). Verilmezse öğrencinin kayıtlı
   * dönemine, o da yoksa "guz"a düşülür.
   */
  term?: StudentTermType;
};

/**
 * Tek doğrulama kaynağı — telafi öneri motoru, telafi manuel planlama VE
 * sıradan (telafi dışı) ders planlama aynı fonksiyonu kullanır. Bitiş saati
 * her zaman burada, okul ders süresine göre yeniden hesaplanır; çağıranın
 * gönderdiği bitiş saatine güvenilmez.
 */
function guidedTeacherMessage(
  code: "TEACHER_UNAVAILABLE" | "TEACHER_CONFLICT",
  teacher: Teacher,
  lessons: Lesson[],
  start: Date,
  duration: number,
  branchId: BranchId,
  excludeLessonId?: string
): string {
  const date = toZonedYmd(start, DEFAULT_APP_TIMEZONE);
  const [day] = buildTeacherDayAvailability(
    { teachers: [teacher], lessons: excludeLessonId ? lessons.filter((l) => l.id !== excludeLessonId) : lessons },
    [],
    { date, branchId }
  );
  if (!day) return SLOT_ERROR_MESSAGES[code];
  const hm = zonedHm(start, DEFAULT_APP_TIMEZONE);
  if (code === "TEACHER_UNAVAILABLE") return slotAdvice(teacher.name, day, hm, duration).message;
  const endHm = zonedHm(addMinutes(start, duration), DEFAULT_APP_TIMEZONE);
  const clash = day.busy.find((b) => b.start < endHm && hm < b.end);
  const next = nearestFreeStart(day, hm, duration);
  const tail = next && next !== hm ? ` En yakın boş saat: ${next}.` : "";
  return clash
    ? `Öğretmenin (${teacher.name}) ${clash.start}–${clash.end} arası başka bir dersi var.${tail}`
    : `${SLOT_ERROR_MESSAGES[code]}${tail}`;
}

export function validateLessonSlot(
  data: AppData,
  context: SlotValidationContext,
  input: { teacherId: string; roomId: string; startAt: string },
  options?: {
    excludeLessonId?: string;
    now?: Date;
    durationMinutes?: number;
    /** İş 3 — TEACHER_UNAVAILABLE'ı hard block yerine soft-onaylı geçişe çevirir. */
    allowAvailabilityOverride?: boolean;
  }
): SlotValidationResult {
  const fail = (code: SlotValidationCode): SlotValidationResult => ({
    ok: false,
    code,
    message: SLOT_ERROR_MESSAGES[code],
  });

  if (
    context.status !== undefined &&
    context.status !== "pending" &&
    context.status !== "suggested"
  ) {
    return fail("REQUEST_NOT_OPEN");
  }

  const start = parseISO(input.startAt);
  if (Number.isNaN(start.getTime())) return fail("INVALID_START");

  if (options?.durationMinutes !== undefined && options.durationMinutes < 30) {
    return fail("INVALID_DURATION");
  }

  /**
   * ÇALIŞMA GÜNÜ — TEK KAYNAK (2026-09-20, src/lib/work-days.ts).
   * Öncelik: yönetici istisnası > resmî tatil > dönemin haftalık kapalı günü.
   * Yani "zorla açık" işaretli bir gün resmî tatil olsa bile planlanabilir;
   * "zorla kapalı" bir gün normalde açık olsa bile planlanamaz. Tek ders,
   * seri, taşıma ve telafi bu fonksiyondan geçtiği için dört akış da aynı
   * cevabı verir — daha önce planlama yalnız resmî tatili görüyor, yöneticinin
   * istisnalarından habersiz kalıyordu.
   */
  const studentTerm = context.term ?? data.students?.find((s) => s.id === context.studentId)?.termType ?? "guz";
  const workDay = assertWorkDaySchedulable(
    start,
    studentTerm,
    data.closedDayOverrides ?? [],
    data.settings.termWeeklyClosedDays
  );
  if (!workDay.ok) {
    return { ok: false, code: "DAY_CLOSED", message: workDay.message, dayReason: workDay.day.reason };
  }

  // 2026-09-30 (owner kararı) — telafi de geçmiş tarihe planlanabilir; alt sınır YOK (kaçan dersten önce de
  // olabilir). Üst sınır talebin son kullanım günü (AFTER_EXPIRY); süresi dolmuş talep planlanamaz
  // (REQUEST_NOT_OPEN). Çakışma, aktif oda, kapalı gün kuralları geçmiş tarihte de AYNEN uygulanır.
  // Öneri motoru yalnız gelecekteki saatleri önerir (bkz. suggestMakeupSlots).
  // Süre dolumu burada da kontrol edilir: `applyMakeupExpiry` yalnız store.ts okumasında çalışır, store içi
  // kayıt (confirmSlot) ham statüyü görür. Eskiden "geçmiş saat yasak" kuralı bunu dolaylı kapatıyordu.
  const now = options?.now ?? new Date();
  if (context.expiresAt !== undefined && context.status !== undefined && parseISO(context.expiresAt) < now) {
    return fail("REQUEST_EXPIRED");
  }

  const duration = options?.durationMinutes ?? data.settings.lessonDurationMinutes;
  const end = addMinutes(start, duration);

  if (context.expiresAt !== undefined) {
    const expire = parseISO(context.expiresAt);
    if (end > expire) return fail("AFTER_EXPIRY");
  }

  // Okulun genel çalışma günü/saati artık ders planlamayı engellemez — talep
  // varsa Pazar veya mesai dışı saatlerde de ders planlanabilir. Öğretmenin
  // kendi bildirdiği müsaitlik penceresi (teacherAvailableOnDay) ayrı ve
  // geçerli bir kısıt olarak kalır.

  const teacher = data.teachers.find((t) => t.id === input.teacherId);
  if (!teacher) return fail("TEACHER_NOT_FOUND");
  // Package D — pasif VEYA işten ayrılmış (terminationDate geçmiş) öğretmen
  // hiçbir planlama akışında aday olamaz; yalnız `active` bayrağına
  // güvenmek, admin unutup güncellemediğinde yanlış pozitif üretebilirdi.
  if (!isTeacherSchedulable(teacher)) return fail("TEACHER_INACTIVE");
  if (!teacher.instruments.includes(context.instrument)) {
    return fail("TEACHER_INSTRUMENT_MISMATCH");
  }

  const room = data.rooms.find((r) => r.id === input.roomId);
  if (!room) return fail("ROOM_NOT_FOUND");
  if (!isRoomSchedulable(room)) return fail("ROOM_INACTIVE");
  if (!roomSupports(room, context.instrument)) return fail("ROOM_INSTRUMENT_MISMATCH");
  // Package D — öğretmen odanın şubesinde fiilen ders veriyor olmalı
  // (birincil VEYA ek atanmış şube); tek-şube eşitliği yerine.
  if (!teacherServesBranch(teacher, room.branchId)) return fail("ROOM_BRANCH_MISMATCH");
  const teacherAvailable = teacherAvailableOnDay(teacher, start, end, room.branchId);
  // 8. tur — öğretmen uyarıları yol gösterici: günün boş aralıkları + en yakın boş slot.
  // Mesaj tembel (getter): öneri döngüleri binlerce aday eler ve yalnız `code`a bakar;
  // metin yalnız kullanıcıya gösterildiğinde (tüm dersleri tarayarak) üretilir.
  const guided = (code: "TEACHER_UNAVAILABLE" | "TEACHER_CONFLICT"): SlotValidationResult => ({
    ok: false,
    code,
    get message() {
      return guidedTeacherMessage(code, teacher, data.lessons, start, duration, room.branchId, options?.excludeLessonId);
    },
  });
  if (!teacherAvailable && !options?.allowAvailabilityOverride) return guided("TEACHER_UNAVAILABLE");
  if (!teacherFree(teacher.id, start, end, data.lessons, options?.excludeLessonId)) {
    return guided("TEACHER_CONFLICT");
  }
  if (dailyLessonCount(teacher.id, start, data.lessons, options?.excludeLessonId) >= teacher.maxDailyLessons) {
    return fail("TEACHER_DAILY_LIMIT");
  }

  if (!roomFree(room.id, start, end, data.lessons, options?.excludeLessonId)) {
    return fail("ROOM_CONFLICT");
  }

  const studentBusy = busy(indexOf(data.lessons).byStudent.get(context.studentId), start, end, options?.excludeLessonId);
  if (studentBusy) return fail("STUDENT_CONFLICT");

  return {
    ok: true,
    slot: {
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      teacherId: teacher.id,
      roomId: room.id,
      branchId: room.branchId,
      availabilityOverridden: !teacherAvailable,
    },
  };
}

/**
 * Telafi slot motoru:
 * - Aynı öğretmen + enstrüman tercihi
 * - Uygunluk/çakışma kontrolü validateLessonSlot() ile tek kaynaktan yapılır
 * - Skor: öğretmen uyumu, yakınlık, yoğunluk, okul kaynaklı öncelik
 */
export function suggestMakeupSlots(
  data: AppData,
  request: MakeupRequest,
  options?: { maxSlots?: number; daysAhead?: number }
): MakeupSlot[] {
  const maxSlots = options?.maxSlots ?? 6;
  const daysAhead = options?.daysAhead ?? data.settings.makeupWindowDays;
  const duration = makeupDurationMinutes(data, request);
  const { workingHours, workingDays } = data.settings;

  const candidates = data.teachers.filter(
    (t) =>
      isTeacherSchedulable(t) &&
      t.instruments.includes(request.instrument as Teacher["instruments"][number])
  );

  // Aynı öğretmen + aynı şube öne
  candidates.sort((a, b) => {
    if (a.id === request.teacherId) return -1;
    if (b.id === request.teacherId) return 1;
    const aServes = teacherServesBranch(a, request.branchId);
    const bServes = teacherServesBranch(b, request.branchId);
    if (aServes && !bServes) return -1;
    if (bServes && !aServes) return 1;
    return 0;
  });

  // 2026-09-30 KÖK NEDEN: pasif oda filtrelenmiyordu (ör. pasif "Stüdyo 1 — Piyano" ilk sırada olduğu için
  // öneriye ve kayda giriyordu). Aday oda = aktif + enstrümana uygun + talebin şubesi; şubede hiç yoksa
  // (2026-09-30) başka şubeye düşülmez: şubede uygun aktif oda yoksa öneri yok, ekran nedenini söyler.
  // Son söz yine validateLessonSlot'ta.
  const roomsFallback = data.rooms.filter(
    (r) => isRoomSchedulable(r) && roomSupports(r, request.instrument) && r.branchId === request.branchId
  );
  const studentTerm = data.students?.find((s) => s.id === request.studentId)?.termType ?? "guz";
  const slots: MakeupSlot[] = [];
  const now = new Date();
  const expire = parseISO(request.expiresAt);

  const todayYmd = toZonedYmd(now, DEFAULT_APP_TIMEZONE);
  for (let d = 1; d <= daysAhead; d++) {
    const ymd = addDaysYmd(todayYmd, d);
    const dayStart = zonedWallTimeToUtc(ymd, workingHours.start);
    if (isAfter(zonedWallTimeToUtc(ymd, "00:00"), expire)) break;
    if (!isSuggestableWorkDay(ymd, studentTerm, data.closedDayOverrides ?? [], data.settings.termWeeklyClosedDays, workingDays)) continue;
    const dayEnd = zonedWallTimeToUtc(ymd, workingHours.end);

    for (let cursor = new Date(dayStart); cursor < dayEnd; cursor = addMinutes(cursor, 30)) {
      const slotEndPreview = addMinutes(cursor, duration);
      if (slotEndPreview > dayEnd) break;
      if (isBefore(cursor, now)) continue;

      for (const teacher of candidates) {
        const teacherRooms = roomsFallback.filter((r) => teacherServesBranch(teacher, r.branchId));
        let matched: ValidatedSlot | null = null;
        for (const room of teacherRooms) {
          const result = validateLessonSlot(
            data,
            request,
            { teacherId: teacher.id, roomId: room.id, startAt: cursor.toISOString() },
            { durationMinutes: duration }
          );
          if (result.ok) {
            matched = result.slot;
            break;
          }
        }
        if (!matched) continue;

        // Gerekçeler yöneticiye gösterilir — doğal Türkçe, teknik terim yok.
        const reasons: string[] = ["Öğretmen, oda ve öğrenci bu saatte boş"];
        let score = 50;

        if (teacher.id === request.teacherId) {
          score += 30;
          reasons.push("Öğrencinin kendi öğretmeni");
        } else {
          score += 5;
          reasons.push("Aynı enstrümanı veren başka öğretmen");
        }

        score += 15;
        reasons.push("Öğrencinin kendi şubesinde, aktif oda");

        // Yakınlık: daha erken saat biraz daha yüksek puan
        score += Math.max(0, 20 - d);
        reasons.push(d === 1 ? "Yarın" : `${d} gün sonra`);

        const load = dailyLessonCount(teacher.id, dayStart, data.lessons);
        if (load <= 2) {
          score += 10;
          reasons.push("Öğretmenin o günkü programı sakin");
        } else if (load >= 5) {
          score -= 8;
          reasons.push("Öğretmenin o günü yoğun");
        }

        // Okul kaynaklı iptaller öncelikli
        if (request.reason.toLowerCase().includes("öğretmen") || request.reason.toLowerCase().includes("okul")) {
          score += 8;
          reasons.push("Ders okul/öğretmen kaynaklı kaçtı — öncelikli");
        }

        slots.push({ ...matched, score, reasons });
      }
    }
  }

  // Skora göre sırala, aynı saatte tek öneri
  slots.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const unique: MakeupSlot[] = [];
  for (const s of slots) {
    const key = `${s.startAt}|${s.teacherId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
    if (unique.length >= maxSlots) break;
  }
  return unique;
}

/**
 * EPIC 10 — 30 günlük SLA sayacı, yönetici ONAYLADIĞI anda (`fromIso`) başlar;
 * talep oluşturma tarihinden değil. `days` parametreleştirilmiş — ileride
 * kurum bazlı ayara dönüştürülebilir (bkz. Açık kararlar).
 */
export function computeSlaDeadline(fromIso: string, days = 30): string {
  return addDays(parseISO(fromIso), days).toISOString();
}

/**
 * Kalan güne göre eskalasyon seviyesi: 0=henüz eşik yok, 1=15 gün kaldı,
 * 2=7 gün, 3=3 gün, 4=1 gün, 5=SLA aşıldı. Yalnızca EN YÜKSEK ulaşılan
 * seviyeyi döner — çağıran taraf (checkMakeupSlaTool) bunu kayıttaki mevcut
 * `slaEscalationLevel` ile karşılaştırıp yalnızca YÜKSELİRSE bildirim/audit
 * üretir; böylece aynı eşik için tekrar tekrar bildirim gitmez.
 */
export function resolveSlaEscalationLevel(deadlineIso: string, nowIso: string): number {
  const daysRemaining = differenceInCalendarDays(parseISO(deadlineIso), parseISO(nowIso));
  if (daysRemaining < 0) return 5;
  if (daysRemaining <= 1) return 4;
  if (daysRemaining <= 3) return 3;
  if (daysRemaining <= 7) return 2;
  if (daysRemaining <= 15) return 1;
  return 0;
}

/** EPIC 10 — onay/iptal/ret kararında zorunlu tutulan (uygulama katmanında) alanlar. */
/** decisionNote: onayda isteğe bağlı (2026-09-30), iptal/retde tool katmanında zorunlu. Boş not saklanmaz. */
export type MakeupDecision = {
  decisionNote?: string;
  decidedBy: string;
  /**
   * 2026-10-04 — yalnız öğretmen müsaitliği (TEACHER_UNAVAILABLE) aşılır; yetkiyi araç katmanı denetler
   * (kurum yöneticisi/şube müdürü). Çakışma, oda, kapalı gün, son kullanım ASLA aşılmaz.
   */
  allowAvailabilityOverride?: boolean;
};

/** EPIC 10 — bir talebin SLA eskalasyon seviyesinin yükseldiği tek olay. */
export type MakeupSlaEscalation = {
  requestId: string;
  studentId: string;
  previousLevel: number;
  newLevel: number;
  slaDeadline: string;
};

export function confirmMakeupSlot(
  data: AppData,
  requestId: string,
  input: { teacherId: string; roomId: string; startAt: string },
  decision: MakeupDecision,
  now: Date = new Date()
): { data: AppData; lessonId: string; slot: ValidatedSlot } {
  const request = data.makeupRequests.find((m) => m.id === requestId);
  if (!request) throw new Error("Telafi talebi bulunamadı");

  const validation = validateLessonSlot(data, request, input, {
    now,
    durationMinutes: makeupDurationMinutes(data, request),
    allowAvailabilityOverride: decision.allowAvailabilityOverride,
  });
  // Yapılandırılmış hata: araç katmanı TEACHER_UNAVAILABLE'ı (istisna onayı istenebilir) diğerlerinden ayırır.
  if (!validation.ok) throw new LessonSlotValidationError(validation.code, validation.message);
  const slot = validation.slot;

  const lessonId = `l_mk_${Date.now().toString(36)}`;
  const lesson: Lesson = {
    id: lessonId,
    studentId: request.studentId,
    teacherId: slot.teacherId,
    roomId: slot.roomId,
    branchId: slot.branchId,
    instrument: request.instrument,
    startAt: slot.startAt,
    endAt: slot.endAt,
    type: "makeup",
    status: "scheduled",
    makeupRequestId: requestId,
    notes: `Telafi · kaynak ders ${request.sourceLessonId}`,
    ...(slot.availabilityOverridden ? { availabilityOverride: { by: decision.decidedBy, at: now.toISOString() } } : {}),
  };

  const decidedAt = now.toISOString();
  const slaDeadline = computeSlaDeadline(decidedAt);

  const makeupRequests = data.makeupRequests.map((m) =>
    m.id === requestId
      ? {
          ...m,
          status: "confirmed" as const,
          suggestedSlots: m.suggestedSlots,
          confirmedLessonId: lessonId,
          decisionNote: decision.decisionNote,
          decidedBy: decision.decidedBy,
          decidedAt,
          slaDeadline,
          slaEscalationLevel: 0,
        }
      : m
  );

  return {
    data: {
      ...data,
      lessons: [...data.lessons, lesson],
      makeupRequests,
    },
    lessonId,
    slot,
  };
}

/**
 * Bir telafi talebini reddeder/iptal eder — `confirmMakeupSlot`'un iptal
 * karşılığı. Yeni ders oluşturmaz, `slaDeadline` set etmez (kapanmış talebin
 * SLA'sı yoktur).
 */
export function cancelMakeupData(
  data: AppData,
  requestId: string,
  decision: MakeupDecision,
  now: Date = new Date()
): { data: AppData } {
  const request = data.makeupRequests.find((m) => m.id === requestId);
  if (!request) throw new Error("Telafi talebi bulunamadı");

  const makeupRequests = data.makeupRequests.map((m) =>
    m.id === requestId
      ? {
          ...m,
          status: "cancelled" as const,
          decisionNote: decision.decisionNote,
          decidedBy: decision.decidedBy,
          decidedAt: now.toISOString(),
        }
      : m
  );

  return { data: { ...data, makeupRequests } };
}

/**
 * EPIC 10 — AI'ın WhatsApp mesajından çıkardığı bir telafi sebebinin ne
 * kadar güvenilir olduğunu değerlendiren SAF sezgisel fonksiyon. Bilinçli
 * olarak minimal: bir metin sınıflandırma modeli DEĞİL, yalnızca "bu metin
 * bir telafi sebebi olarak insan onayı olmadan kabul edilecek kadar açık
 * mı?" sorusuna kaba bir cevap verir. DÜŞÜK güvenle ASLA otomatik yazma
 * yapılmamalı — çağıran taraf `confidence === "low"` durumunda talebi
 * `"awaiting_info"` durumunda oluşturmalı ve netleştirme şablonu göndermeli.
 *
 * NOT (kapsam kararı): Bu fonksiyon şu an `markAttendance`/telafi oluşturma
 * akışına BAĞLANMADI — mevcut, yoğun test kapsamlı akışı bu turda riske
 * atmamak için kasıtlı olarak yalnızca saf, test edilmiş bir yapı taşı
 * olarak bırakıldı (bkz. IMPLEMENTATION_PLAN.md EPIC 10 "Açık kararlar").
 */
export function inferMakeupReasonConfidence(
  rawReason: string | undefined
): { confidence: "high" | "low"; reason?: string } {
  const reason = rawReason?.trim();
  if (!reason) return { confidence: "low" };

  // Çok kısa ("ok", "tamam", "evet" gibi) ya da yalnızca noktalama/rakamdan
  // oluşan metinler bir sebep taşımaz.
  if (reason.length < 6 || !/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(reason)) {
    return { confidence: "low", reason };
  }

  const VAGUE_PHRASES = [
    "bilmiyorum",
    "sonra söylerim",
    "bakarım",
    "belki",
    "haber veririm",
  ];
  const lower = reason.toLocaleLowerCase("tr");
  if (VAGUE_PHRASES.some((p) => lower.includes(p))) {
    return { confidence: "low", reason };
  }

  return { confidence: "high", reason };
}

export type TrialSlotCode =
  | "INVALID_START"
  | "DAY_CLOSED"
  | "TEACHER_NOT_FOUND"
  | "TEACHER_INACTIVE"
  | "TEACHER_INSTRUMENT_MISMATCH"
  | "TEACHER_BRANCH_MISMATCH"
  | "TEACHER_UNAVAILABLE"
  | "TEACHER_CONFLICT"
  | "TEACHER_TRIAL_CONFLICT";

/**
 * Deneme dersi düzenleme doğrulaması (2026-09-26). Denemede oda ve öğrenci yok,
 * süre 10–20 dk — `validateLessonSlot`'un oda/30-dk kuralları uygulanamaz; ama
 * ÖĞRETMEN kuralları normal dersle aynı yardımcılardan geçer: çalışma günü,
 * aktiflik, enstrüman, şube, müsaitlik penceresi, ders çakışması. Ek olarak
 * öğretmenin başka bir denemesiyle çakışma.
 */
export function validateTrialSlot(
  data: Pick<AppData, "teachers" | "lessons" | "settings" | "closedDayOverrides">,
  input: { teacherId: string; branchId: BranchId; instrument: string; startAt: string; durationMinutes: number },
  otherTrials: Array<{ id: string; teacherId: string; startAt: string; endAt: string; status: string }>,
  options?: { excludeTrialId?: string; allowAvailabilityOverride?: boolean }
): { ok: true } | { ok: false; code: TrialSlotCode; message: string } {
  const start = parseISO(input.startAt);
  if (Number.isNaN(start.getTime())) return { ok: false, code: "INVALID_START", message: "Geçerli bir tarih ve saat seçin." };
  const workDay = assertWorkDaySchedulable(
    start,
    "guz",
    data.closedDayOverrides ?? [],
    data.settings.termWeeklyClosedDays
  );
  if (!workDay.ok) return { ok: false, code: "DAY_CLOSED", message: workDay.message };
  const end = addMinutes(start, input.durationMinutes);
  const teacher = data.teachers.find((t) => t.id === input.teacherId);
  if (!teacher) return { ok: false, code: "TEACHER_NOT_FOUND", message: "Seçilen öğretmen bulunamadı. Listeden yeniden seçin." };
  if (!isTeacherSchedulable(teacher)) {
    return { ok: false, code: "TEACHER_INACTIVE", message: `${teacher.name} pasif veya işten ayrılmış; başka bir öğretmen seçin.` };
  }
  if (!teacher.instruments.includes(input.instrument as Instrument)) {
    return {
      ok: false,
      code: "TEACHER_INSTRUMENT_MISMATCH",
      message: `${teacher.name} ${input.instrument} dersi vermiyor. Öğretmenin branşını Öğretmenler ekranından kontrol edin veya başka öğretmen seçin.`,
    };
  }
  if (!teacherServesBranch(teacher, input.branchId)) {
    return {
      ok: false,
      code: "TEACHER_BRANCH_MISMATCH",
      message: `${teacher.name} bu şubede ders vermiyor. Şubeyi değiştirin veya öğretmenin şube atamasını Öğretmenler ekranından güncelleyin.`,
    };
  }
  if (!options?.allowAvailabilityOverride && !teacherAvailableOnDay(teacher, start, end, input.branchId)) {
    return {
      ok: false,
      code: "TEACHER_UNAVAILABLE",
      message: `${teacher.name} bu saatte müsait değil (öğretmenin müsaitlik penceresi dışında). Başka saat seçin veya müsaitlik dışı planlamayı onaylayın.`,
    };
  }
  if (!teacherFree(teacher.id, start, end, data.lessons)) {
    return { ok: false, code: "TEACHER_CONFLICT", message: `${teacher.name} bu saatte başka bir derste. Başka saat seçin.` };
  }
  const trialClash = otherTrials.some(
    (t) =>
      t.id !== options?.excludeTrialId &&
      t.teacherId === teacher.id &&
      t.status !== "cancelled" &&
      overlaps(start, end, parseISO(t.startAt), parseISO(t.endAt))
  );
  if (trialClash) {
    return { ok: false, code: "TEACHER_TRIAL_CONFLICT", message: `${teacher.name} bu saatte başka bir deneme dersinde. Başka saat seçin.` };
  }
  return { ok: true };
}
