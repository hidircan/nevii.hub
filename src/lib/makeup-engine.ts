import {
  addDays,
  addMinutes,
  differenceInCalendarDays,
  format,
  getDay,
  isBefore,
  isAfter,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
} from "date-fns";
import type {
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

function parseHm(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return { h, m };
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function roomSupports(room: Room, instrument: string) {
  return room.instruments.includes(instrument as Room["instruments"][number]);
}

function teacherFree(
  teacherId: string,
  start: Date,
  end: Date,
  lessons: Lesson[],
  excludeLessonId?: string
) {
  return !lessons.some((l) => {
    if (l.teacherId !== teacherId) return false;
    if (l.status === "cancelled") return false;
    if (excludeLessonId && l.id === excludeLessonId) return false;
    return overlaps(start, end, parseISO(l.startAt), parseISO(l.endAt));
  });
}

function roomFree(
  roomId: string,
  start: Date,
  end: Date,
  lessons: Lesson[],
  excludeLessonId?: string
) {
  return !lessons.some((l) => {
    if (l.roomId !== roomId) return false;
    if (l.status === "cancelled") return false;
    if (excludeLessonId && l.id === excludeLessonId) return false;
    return overlaps(start, end, parseISO(l.startAt), parseISO(l.endAt));
  });
}

function teacherAvailableOnDay(teacher: Teacher, day: Date, start: Date, end: Date, branchId: BranchId) {
  const dow = getDay(day);
  const windows = availabilityForBranch(teacher.availability, branchId).filter((a) => a.dayOfWeek === dow);
  if (!windows.length) return false;
  return windows.some((w) => {
    const { h: sh, m: sm } = parseHm(w.start);
    const { h: eh, m: em } = parseHm(w.end);
    const winStart = setMinutes(setHours(startOfDay(day), sh), sm);
    const winEnd = setMinutes(setHours(startOfDay(day), eh), em);
    return !isBefore(start, winStart) && !isAfter(end, winEnd);
  });
}

function dailyLessonCount(teacherId: string, day: Date, lessons: Lesson[]) {
  return lessons.filter((l) => {
    if (l.teacherId !== teacherId || l.status === "cancelled") return false;
    return format(parseISO(l.startAt), "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
  }).length;
}

export type SlotValidationCode =
  | "REQUEST_NOT_OPEN"
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
  | "ROOM_INSTRUMENT_MISMATCH"
  | "ROOM_BRANCH_MISMATCH"
  | "ROOM_CONFLICT"
  | "STUDENT_CONFLICT";

export const SLOT_ERROR_MESSAGES: Record<SlotValidationCode, string> = {
  REQUEST_NOT_OPEN: "Bu telafi talebi zaten sonuçlandırılmış.",
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
  ROOM_INSTRUMENT_MISMATCH: "Seçilen oda bu enstrümana uygun değil.",
  ROOM_BRANCH_MISMATCH: "Oda, öğretmenin şubesiyle uyumsuz.",
  ROOM_CONFLICT: "Odanın bu saatte başka bir dersi var.",
  STUDENT_CONFLICT: "Öğrencinin bu saatte başka bir dersi var.",
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
  | { ok: false; code: SlotValidationCode; message: string };

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
};

/**
 * Tek doğrulama kaynağı — telafi öneri motoru, telafi manuel planlama VE
 * sıradan (telafi dışı) ders planlama aynı fonksiyonu kullanır. Bitiş saati
 * her zaman burada, okul ders süresine göre yeniden hesaplanır; çağıranın
 * gönderdiği bitiş saatine güvenilmez.
 */
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

  const now = options?.now ?? new Date();
  if (start < now) return fail("PAST_START");

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
  const day = startOfDay(start);

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
  if (!roomSupports(room, context.instrument)) return fail("ROOM_INSTRUMENT_MISMATCH");
  // Package D — öğretmen odanın şubesinde fiilen ders veriyor olmalı
  // (birincil VEYA ek atanmış şube); tek-şube eşitliği yerine.
  if (!teacherServesBranch(teacher, room.branchId)) return fail("ROOM_BRANCH_MISMATCH");
  const teacherAvailable = teacherAvailableOnDay(teacher, day, start, end, room.branchId);
  if (!teacherAvailable && !options?.allowAvailabilityOverride) return fail("TEACHER_UNAVAILABLE");
  if (!teacherFree(teacher.id, start, end, data.lessons, options?.excludeLessonId)) {
    return fail("TEACHER_CONFLICT");
  }
  if (dailyLessonCount(teacher.id, day, data.lessons) >= teacher.maxDailyLessons) {
    return fail("TEACHER_DAILY_LIMIT");
  }

  if (!roomFree(room.id, start, end, data.lessons, options?.excludeLessonId)) {
    return fail("ROOM_CONFLICT");
  }

  const studentBusy = data.lessons.some((l) => {
    if (options?.excludeLessonId && l.id === options.excludeLessonId) return false;
    if (l.studentId !== context.studentId || l.status === "cancelled") return false;
    return overlaps(start, end, parseISO(l.startAt), parseISO(l.endAt));
  });
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
  const duration = data.settings.lessonDurationMinutes;
  const { workingHours, workingDays } = data.settings;
  const { h: whStartH, m: whStartM } = parseHm(workingHours.start);
  const { h: whEndH, m: whEndM } = parseHm(workingHours.end);

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

  const rooms = data.rooms.filter(
    (r) => roomSupports(r, request.instrument) && r.branchId === request.branchId
  );
  // Aynı şubede oda yoksa diğer şubeye düş
  const roomsFallback =
    rooms.length > 0
      ? rooms
      : data.rooms.filter((r) => roomSupports(r, request.instrument));
  const slots: MakeupSlot[] = [];
  const now = new Date();
  const expire = parseISO(request.expiresAt);

  for (let d = 1; d <= daysAhead; d++) {
    const day = addDays(startOfDay(now), d);
    if (isAfter(day, expire)) break;
    const dow = getDay(day);
    if (!workingDays.includes(dow)) continue;

    const dayStart = setMinutes(setHours(day, whStartH), whStartM);
    const dayEnd = setMinutes(setHours(day, whEndH), whEndM);

    for (let cursor = new Date(dayStart); cursor < dayEnd; cursor = addMinutes(cursor, 30)) {
      const slotEndPreview = addMinutes(cursor, duration);
      if (slotEndPreview > dayEnd) break;
      if (isBefore(cursor, now)) continue;

      for (const teacher of candidates) {
        const teacherRooms = roomsFallback.filter((r) => teacherServesBranch(teacher, r.branchId));
        let matched: ValidatedSlot | null = null;
        for (const room of teacherRooms) {
          const result = validateLessonSlot(data, request, {
            teacherId: teacher.id,
            roomId: room.id,
            startAt: cursor.toISOString(),
          });
          if (result.ok) {
            matched = result.slot;
            break;
          }
        }
        if (!matched) continue;

        const reasons: string[] = [];
        let score = 50;

        if (teacher.id === request.teacherId) {
          score += 30;
          reasons.push("Aynı öğretmen");
        } else {
          score += 5;
          reasons.push("Alternatif öğretmen (aynı enstrüman)");
        }

        if (teacherServesBranch(teacher, request.branchId)) {
          score += 15;
          reasons.push("Aynı şube");
        } else {
          score -= 10;
          reasons.push("Diğer şube");
        }

        // Yakınlık: daha erken slot biraz daha yüksek skor
        score += Math.max(0, 20 - d);
        reasons.push(`${d} gün içinde`);

        const load = dailyLessonCount(teacher.id, day, data.lessons);
        if (load <= 2) {
          score += 10;
          reasons.push("Öğretmen programı rahat");
        } else if (load >= 5) {
          score -= 8;
          reasons.push("Yoğun gün");
        }

        // Okul kaynaklı iptaller öncelikli
        if (request.reason.toLowerCase().includes("öğretmen") || request.reason.toLowerCase().includes("okul")) {
          score += 8;
          reasons.push("Okul kaynaklı — öncelikli");
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
export type MakeupDecision = { decisionNote: string; decidedBy: string };

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

  const validation = validateLessonSlot(data, request, input);
  if (!validation.ok) throw new Error(validation.message);
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
