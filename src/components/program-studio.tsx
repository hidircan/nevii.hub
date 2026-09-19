"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Sparkles, TriangleAlert, X } from "lucide-react";
import { addMinutes, differenceInMinutes, format, isSameDay, parseISO, startOfDay } from "date-fns";
import { tr } from "date-fns/locale";
import {
  actionAddLesson,
  actionCancelEntireSeries,
  actionCancelLesson,
  actionCancelSeriesFromLesson,
  actionCreateLessonSeries,
  actionPreviewLessonSeries,
  actionSuggestLessonSlots,
  actionUpdateLessonSchedule,
} from "@/lib/actions";
import type { LessonCommunicationMessage } from "@/lib/whatsapp-templates";
import type { LessonSlotSuggestion } from "@/lib/lesson-scheduling";
import type { SeriesOccurrenceCheck } from "@/lib/lesson-series";
import { LessonScopeEditor } from "@/components/lesson-scope-editor";
import { emptyProgramNotices, onlyNotice } from "@/lib/program-notices";
import {
  DEFAULT_APP_TIMEZONE,
  isoToWallDateTimeInput,
  toWallClockDate,
  wallDateTimeInputToIso,
  zonedHm,
  zonedWallTimeToUtc,
} from "@/lib/timezone";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { LessonOpsActions, LessonOpsBadges } from "@/components/lesson-ops-actions";
import { LessonStatusBadge } from "@/components/lesson-status-badge";
import { lessonCancelBlockReason } from "@/lib/lesson-cancel-rules";
import { LessonReassignmentModal } from "@/components/lesson-reassignment-modal";
import { INSTRUMENTS, type Instrument, type Lesson, type Room, type Student, type Teacher } from "@/lib/types";
import { dayName } from "@/lib/utils";
import { DEFAULT_LESSON_DURATION_MINUTES, LESSON_DURATION_OPTIONS } from "@/lib/lesson-duration";
import { CALENDAR_START_HOUR, turkeyFixedPublicHolidays, toYmd } from "@/lib/closed-days";
import {
  lessonMatchesAcademicPeriod,
  lessonCardFillStyle,
  lessonCardMutedTextColor,
} from "@/lib/attendance-calendar";
import { resolveLessonFinalStatus, type LessonFinalStatus } from "@/lib/lesson-live-status";
import {
  applyOpsOverride,
  pruneSettledOverrides,
  type LessonOpsFlagValue,
} from "@/lib/lesson-ops-override";

type ProgramStudioProps = {
  students: Student[];
  teachers: Teacher[];
  rooms: Room[];
  branchNames: Record<string, string>;
  /** "Tüm kurumlar" görünümünde false — yazma tek bir kuruma karşı yapılmalı. */
  canCreate: boolean;
  workingHours: { start: string; end: string };
  days: string[];
  weekLessons: Lesson[];
  todayIso: string;
  /** Öğrenci detayından "Programda Aç" ile gelinirse başlangıç öğrenci filtresi. */
  initialStudentFilter?: string;
  /**
   * ÖNCELİK 4 (devam) — /panel/program üstündeki akademik yıl/dönem seçici
   * (progTerm/progYear). Yeni tek ders VEYA yeni seri oluşturulurken otomatik
   * olarak bu değerler atanır — kullanıcı ayrıca seçmek zorunda değil.
   */
  selectedTerm?: "guz" | "yaz";
  selectedAcademicYearStart?: number;
  /**
   * ÖNCELİK 4 (devam) — Yönetilebilir Enstrüman Kataloğu. Sabit `INSTRUMENTS`
   * yerine tenant'ın aktif katalog listesi (statik küme + kurumun eklediği
   * enstrümanlar) — verilmezse `INSTRUMENTS`'a düşer (geriye dönük uyumlu).
   */
  catalogInstruments?: string[];
};

/**
 * 2026-09-19 — SEÇİM vurgusu, statü dolgusundan (ATTENDANCE_CALENDAR_COLORS) tamamen
 * ayrı bir kanal: kalın metin-renkli çerçeve + gölge + öne alma. Arka plan rengine
 * DOKUNMAZ; böylece "seçili" hiçbir zaman "Geldi/İşlendi" gibi okunmaz.
 */
export const LESSON_SELECTED_CLASS =
  "!z-[15] outline outline-[3px] outline-offset-2 outline-[var(--color-text)] shadow-[var(--shadow-lg)]";

const SLOT_MINUTES = 30;
const SLOT_HEIGHT_PX = 28;

function toDatetimeLocalValue(iso: string) {
  return isoToWallDateTimeInput(iso);
}

function parseHm(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function slotStarts(startMin: number, endMin: number) {
  const slots: number[] = [];
  for (let t = startMin; t < endMin; t += SLOT_MINUTES) slots.push(t);
  return slots;
}

/**
 * Türkiye'nin sabit tarihli resmî tatilleri — salt görsel bir işaret (kırmızı
 * gün başlığı). Dini tatiller (ay takvimine bağlı) ve yönetici özel kapalı
 * günleri henüz bir veri modeliyle desteklenmiyor (ClosedDay tipi var ama
 * store/tool/UI'ı yok) — bu yüzden yalnızca sabit millî günler işaretlenir.
 */
function fixedHolidayName(day: Date): string | null {
  const ymd = toYmd(day);
  const holiday = turkeyFixedPublicHolidays(day.getFullYear()).find((h) => h.date === ymd);
  return holiday?.name ?? null;
}

function minutesOfDay(iso: string) {
  // Kök neden düzeltmesi — bkz. timezone.ts zonedHm yorumu: getHours()/getMinutes()
  // ÇALIŞAN MAKİNENİN yerel saat dilimini kullanır, ISO'nun kendi ofsetini değil.
  const [h, m] = zonedHm(parseISO(iso), DEFAULT_APP_TIMEZONE).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Takvim grid'inin dikey saat aralığı artık okulun mesai saatiyle sınırlı
 * değil — Pazar veya mesai dışı planlanmış bir ders varsa grid o dersi de
 * kapsayacak şekilde genişler, aksi halde okulun normal çalışma saati
 * görünümü korunur. Saf fonksiyon — birim testlerinde kullanılır.
 */
/**
 * Takvim her zaman 10:00'da başlar (09:00–10:00 hiç görünmez) — okulun
 * mesai saati veya mesai-dışı erken bir ders bile bu tabanın altına
 * inemez. Bitiş hâlâ mesai saatinden geç bir dersle genişleyebilir
 * (bu davranış değişmedi).
 */
export function computeGridWindow(
  workingHours: { start: string; end: string },
  lessons: { startAt: string; endAt: string }[]
): { startMin: number; endMin: number } {
  let startMin = parseHm(workingHours.start);
  let endMin = parseHm(workingHours.end);
  for (const lesson of lessons) {
    const lessonStart = minutesOfDay(lesson.startAt);
    const lessonEnd = lessonStart + differenceInMinutes(parseISO(lesson.endAt), parseISO(lesson.startAt));
    startMin = Math.min(startMin, lessonStart);
    endMin = Math.max(endMin, lessonEnd);
  }
  startMin = Math.max(startMin, CALENDAR_START_HOUR * 60);
  startMin = Math.floor(startMin / SLOT_MINUTES) * SLOT_MINUTES;
  endMin = Math.ceil(endMin / SLOT_MINUTES) * SLOT_MINUTES;
  return { startMin, endMin };
}

/** Sadece normal (telafi olmayan), planlanmış ve gelecekteki dersler taşınabilir/resize edilebilir. */
function canMoveOrResize(lesson: Lesson, now: Date) {
  return lesson.type === "regular" && lesson.status === "scheduled" && parseISO(lesson.startAt) > now;
}

/** Öğrenci varsa: mevcut öğretmeni ve aynı şubeyi öne alarak sıralar. */
function teacherOptionsFor(teachers: Teacher[], instrument: Instrument, student?: Student): Teacher[] {
  return [...teachers.filter((t) => t.active && t.instruments.includes(instrument))].sort((a, b) => {
    if (student) {
      if (a.id === student.teacherId && b.id !== student.teacherId) return -1;
      if (b.id === student.teacherId && a.id !== student.teacherId) return 1;
      if (a.branchId === student.branchId && b.branchId !== student.branchId) return -1;
      if (b.branchId === student.branchId && a.branchId !== student.branchId) return 1;
    }
    return a.name.localeCompare(b.name, "tr");
  });
}

/**
 * Seçili öğretmenin şubesiyle ve enstrümanla uyumlu, AKTİF odalarla daraltır.
 * ÖNCELİK 4 (devam) — pasife alınmış bir oda yeni ders planlamasında
 * seçilemez (`r.active !== false` — legacy odalarda `active` alanı yoksa
 * varsayılan aktif kabul edilir, geriye dönük kırılma yok).
 */
function roomOptionsFor(rooms: Room[], instrument: Instrument, teacher?: Teacher): Room[] {
  return rooms.filter(
    (r) => r.active !== false && r.instruments.includes(instrument) && (!teacher || r.branchId === teacher.branchId)
  );
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** Aynı gün çakışan (farklı öğretmen/oda) dersler için basit "lane" ataması — greedy interval scheduling. */
function assignLanes(dayLessons: Lesson[]): { laneOf: Map<string, number>; laneCount: number } {
  const sorted = [...dayLessons].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const laneEndTimes: number[] = [];
  const laneOf = new Map<string, number>();
  for (const lesson of sorted) {
    const start = parseISO(lesson.startAt).getTime();
    const end = parseISO(lesson.endAt).getTime();
    let lane = laneEndTimes.findIndex((endTime) => endTime <= start);
    if (lane === -1) {
      lane = laneEndTimes.length;
      laneEndTimes.push(end);
    } else {
      laneEndTimes[lane] = end;
    }
    laneOf.set(lesson.id, lane);
  }
  return { laneOf, laneCount: Math.max(laneEndTimes.length, 1) };
}

/**
 * Kısa süreli derslerde kart yüksekliği tüm satırlara yetmeyebilir; bu yüzden
 * içerik satır satır önceliklendirilir. Öğrenci adı ve saat her koşulda
 * görünür kalır, öğretmen/enstrüman·şube yalnızca yeterli yükseklik varsa
 * eklenir. Saf fonksiyon — birim testlerinde kullanılır.
 */
export function lessonCardTier(heightPx: number): "min" | "compact" | "full" {
  // Eşikler `LessonCardBody`'nin gerçek satır yüksekliklerinden (leading-tight
  // font boyutları + kartın p-1.5 dolgusu) türetilir — 46/30 eski eşikleri
  // gerçekte gereken ~66px/~51px'in altındaydı, bu da "full"/"compact"
  // katmanının kutuya SIĞMADAN seçilmesine (dikey taşma) yol açıyordu. Kart
  // artık `overflow-hidden` ile de korunuyor (bkz. LessonCardBody sarmalayıcı
  // div'i) — bu eşikler taşmayı ÖNLER, overflow-hidden ise son çare kesim.
  if (heightPx < 40) return "min";
  if (heightPx < 64) return "compact";
  return "full";
}

export type LessonCardStatusVisual = LessonFinalStatus;

/**
 * P0 (2026-09-05) — kullanıcı raporu: ders kutucuklarında durum yalnızca
 * detay modalındaki küçük bir `Badge`de görünüyordu, program IZGARASINDA
 * (asıl günlük kullanım yeri) hiç görünmüyordu. Tek gerçek kaynak
 * `resolveLessonFinalStatus` (lesson-live-status.ts, zaten test edilmiş) —
 * burada YENİDEN sınıflandırma mantığı YAZILMAZ.
 *
 * P0 UAT (2026-09-07) — eskiden "planned"/"cancelled" tek bir "default"
 * kategorisine katlanıyordu; artık `resolveLessonFinalStatus` çıktısı AYNEN
 * taşınır, böylece "İptal" kendi (koyu gri) dolgusunu alır ve "Planlandı"
 * nötr kalır. Renk/metin eşlemesinin TEK kaynağı
 * `lessonCardFillStyle` (src/lib/attendance-calendar.ts) — burada ikinci bir
 * Tailwind renk sözlüğü TUTULMAZ (önceden `bg-emerald-700`/`bg-rose-700`/
 * `bg-amber-400` diye ayrı bir eşleme vardı ve takvimle ayrışmıştı).
 */
export function lessonCardStatusVisual(lesson: Lesson, now: Date = new Date()): LessonCardStatusVisual {
  // Ders Programı kartı, işaretlenmiş statüyü GELECEKTEKİ derslerde de gösterir
  // (owner UAT kararı 2026-09-07) — 2026-09-09'da Yoklama Takvimi de AYNI
  // çözümleyiciye bağlandı, iki fonksiyon tek fonksiyonda birleşti (§B.4).
  return resolveLessonFinalStatus(lesson, now);
}

const LESSON_CARD_STATUS_LABEL: Partial<Record<LessonCardStatusVisual, string>> = {
  attended: "Geldi",
  processed: "İşlendi",
  makeup: "Telafi",
  cancelled: "İptal",
};

/**
 * Ders hover kartındaki satırlar — saf fonksiyon, DOM'\''dan bağımsız birim
 * testlerinde kullanılır (bkz. `LessonHoverCard`, tek tüketicisi).
 */
export function lessonHoverCardLines(
  lesson: Lesson,
  student?: Student,
  teacher?: Teacher,
  room?: Room,
  branchName?: string
): string[] {
  const timeRange = `${zonedHm(parseISO(lesson.startAt), DEFAULT_APP_TIMEZONE)}–${zonedHm(parseISO(lesson.endAt), DEFAULT_APP_TIMEZONE)}`;
  const dateLabel = format(toWallClockDate(lesson.startAt), "d MMMM yyyy, EEEE", { locale: tr });
  const lines = [student?.name ?? "Öğrenci bilinmiyor", dateLabel, timeRange];
  if (teacher?.name) lines.push(`Öğretmen: ${teacher.name}`);
  if (lesson.instrument) lines.push(`Enstrüman: ${lesson.instrument}`);
  if (room?.name) lines.push(`Salon: ${room.name}`);
  if (branchName) lines.push(`Şube: ${branchName}`);
  if (lesson.type === "makeup") lines.push("Telafi dersi");
  if (lesson.availabilityOverride) lines.push("Öğretmenin müsait olmadığı bir saat");
  return lines;
}

/**
 * P0 UAT (2026-09-07) — "hover ile açılan bilgi notu bazen ekranda takılı kalıyor".
 *
 * KÖK NEDEN: görünürlük saf CSS ile sürülüyordu ve kurallar arasında
 * `group-focus-within:opacity-100` vardı. `:focus-within` FARE ile gelen odağı
 * da kapsar: kullanıcı bir ders kartına TIKLADIĞINDA kart (bir <button>) odakta
 * kalır, dolayısıyla fare karttan ayrılsa bile tooltip görünür kalıyordu —
 * "takılı" görüntüsü buydu. Kural kaldırıldı.
 *
 * Klavye erişilebilirliği KORUNDU: `group-focus-visible` (yalnız klavye odağı)
 * duruyor, ayrıca kartta Escape ile odak bırakılır (bkz. onKeyDown).
 * Kapanma yolları: pointer leave (hover), blur (focus-visible), Escape,
 * route değişimi (bileşen unmount), başka bir kartın hover'ı (aynı anda tek
 * kart hover olabilir).
 */
function LessonHoverCard({
  lesson,
  student,
  teacher,
  room,
  branchName,
}: {
  lesson: Lesson;
  student?: Student;
  teacher?: Teacher;
  room?: Room;
  branchName?: string;
}) {
  const [name, dateLabel, timeRange, ...rest] = lessonHoverCardLines(lesson, student, teacher, room, branchName);
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-56 -translate-x-1/2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-2.5 text-left text-[11px] leading-snug text-[var(--color-text)] opacity-0 shadow-[var(--shadow-md)] transition-opacity delay-150 duration-100 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      <p className="font-bold">{name}</p>
      <p className="text-[var(--color-text-muted)]">{dateLabel}</p>
      <p className="text-[var(--color-text-muted)]">{timeRange}</p>
      {rest.map((line) => (
        <p
          key={line}
          className={line === "Telafi dersi" || line === "Öğretmenin müsait olmadığı bir saat" ? "mt-1 font-medium text-amber-600" : undefined}
        >
          {line}
        </p>
      ))}
    </div>
  );
}

/** Ders kartının erişilebilir açıklaması — ekran okuyucu için tüm bağlamı tek cümlede verir. */
export function lessonAccessibleLabel(
  lesson: Lesson,
  student?: Student,
  teacher?: Teacher,
  room?: Room,
  branchName?: string
): string {
  const timeRange = `${zonedHm(parseISO(lesson.startAt), DEFAULT_APP_TIMEZONE)}–${zonedHm(parseISO(lesson.endAt), DEFAULT_APP_TIMEZONE)}`;
  const parts = [
    student?.name ?? "Öğrenci bilinmiyor",
    timeRange,
    teacher?.name,
    lesson.instrument,
    room?.name,
    branchName,
    lesson.type === "makeup" ? "Telafi dersi" : undefined,
  ].filter(Boolean);
  return parts.join(" · ");
}

function LessonCardBody({
  student,
  teacher,
  lesson,
  branchName,
  tier,
  statusVisual = "planned",
}: {
  student?: Student;
  teacher?: Teacher;
  lesson: Lesson;
  branchName?: string;
  tier: "min" | "compact" | "full";
  statusVisual?: LessonCardStatusVisual;
}) {
  const timeRange = `${zonedHm(parseISO(lesson.startAt), DEFAULT_APP_TIMEZONE)}–${zonedHm(parseISO(lesson.endAt), DEFAULT_APP_TIMEZONE)}`;
  const text = {
    primary: lessonCardFillStyle(statusVisual).color,
    muted: lessonCardMutedTextColor(statusVisual),
  };
  const statusLabel = LESSON_CARD_STATUS_LABEL[statusVisual];
  return (
    <>
      {lesson.availabilityOverride ? (
        <TriangleAlert
          className="absolute right-1 top-1 h-3 w-3 text-amber-500"
          aria-hidden
        >
          <title>Öğretmenin müsait olmadığı bir saatte, onayla planlandı</title>
        </TriangleAlert>
      ) : null}
      <p
        style={{ color: text.primary }}
        className={`truncate font-bold leading-tight ${tier === "full" ? "text-[13px]" : "text-[11px]"}`}
        title={student?.name}
      >
        {student?.name}
      </p>
      <p
        style={{ color: text.muted }}
        className={`truncate font-medium leading-tight ${tier === "full" ? "text-[11px]" : "text-[10px]"}`}
      >
        {timeRange}
        {/* Renk yalnız görsel — durum burada METİN olarak da görünür (ekran okuyucu + renk körlüğü için). */}
        {statusLabel ? ` · ${statusLabel}` : ""}
      </p>
      {tier !== "min" ? (
        <p
          style={{ color: text.muted }}
          className="truncate text-[10px] leading-tight"
          title={`${teacher?.name ?? ""}${branchName ? ` · ${branchName}` : ""}`}
        >
          {teacher?.name}
          {branchName ? ` · ${branchName}` : ""}
        </p>
      ) : null}
      {tier === "full" ? (
        <p style={{ color: text.muted }} className="truncate text-[9px] leading-tight" title={lesson.instrument}>
          {lesson.instrument}
        </p>
      ) : null}
    </>
  );
}

/** Program ekranı hızlı filtreleri — saf fonksiyonlar, birim testlerinde kullanılır. */
export function filterLessonsForCalendar(
  lessons: Lesson[],
  filterBranchId: string,
  filterTeacherId: string,
  filterStudentId = ""
): Lesson[] {
  return lessons.filter((l) => {
    if (filterBranchId && l.branchId !== filterBranchId) return false;
    if (filterTeacherId && l.teacherId !== filterTeacherId) return false;
    if (filterStudentId && l.studentId !== filterStudentId) return false;
    return true;
  });
}

export function activeTeachersForBranch(teachers: Teacher[], filterBranchId: string): Teacher[] {
  return teachers
    .filter((t) => t.active && (!filterBranchId || t.branchId === filterBranchId))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

/** Şube filtresi değişince geçersiz kalan öğretmen filtresini "Tüm öğretmenler"e döndürür. */
export function resolveTeacherFilterForBranch(
  teachers: Teacher[],
  nextBranchId: string,
  currentTeacherId: string
): string {
  if (!currentTeacherId) return currentTeacherId;
  const teacher = teachers.find((t) => t.id === currentTeacherId);
  if (!teacher || (nextBranchId && teacher.branchId !== nextBranchId)) return "";
  return currentTeacherId;
}

/** Şube değişince geçersiz kalan oda seçimini sıfırlar. */
export function resolveRoomFilterForBranch(
  rooms: Room[],
  nextBranchId: string,
  currentRoomId: string
): string {
  if (!currentRoomId) return currentRoomId;
  const room = rooms.find((r) => r.id === currentRoomId);
  if (!room || (nextBranchId && room.branchId !== nextBranchId)) return "";
  return currentRoomId;
}

export function studentsForBranch(students: Student[], filterBranchId: string): Student[] {
  return students
    .filter((s) => !filterBranchId || s.branchId === filterBranchId)
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

/** Şube filtresi değişince geçersiz kalan öğrenci filtresini "Tüm öğrenciler"e döndürür. */
export function resolveStudentFilterForBranch(
  students: Student[],
  nextBranchId: string,
  currentStudentId: string
): string {
  if (!currentStudentId) return currentStudentId;
  const student = students.find((s) => s.id === currentStudentId);
  if (!student || (nextBranchId && student.branchId !== nextBranchId)) return "";
  return currentStudentId;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * document.body altına portallanan, takvimin sticky/relative katmanlarından
 * bağımsız bir modal katmanı — hangi stacking context içinde çağrıldığından
 * etkilenmeden her zaman en üstte kalır. Yeni paket gerektirmez (react-dom
 * zaten bağımlılık). Odak tuzağı: açılışta kapama düğmesine odaklanır, Tab
 * döngüsünü modal içinde tutar, kapanınca tetikleyen öğeye odağı geri verir.
 */
function FormModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    triggerElementRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      triggerElementRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const container = dialogRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-8 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-[var(--color-surface)] shadow-2xl dark:bg-slate-900 dark:shadow-black/40"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-5 pb-4 dark:border-slate-800">
          <h3 className="font-semibold text-[var(--color-text)] dark:text-slate-50">{title}</h3>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-muted)] dark:text-slate-300"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 pt-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}

type ActivePanel = "none" | "create" | "series";
type CalendarView = "day" | "week";

export function ProgramStudio({
  students,
  teachers,
  rooms,
  branchNames,
  canCreate,
  workingHours,
  days,
  weekLessons,
  todayIso,
  initialStudentFilter,
  selectedTerm,
  selectedAcademicYearStart,
  catalogInstruments,
}: ProgramStudioProps) {
  const router = useRouter();
  const now = parseISO(todayIso);

  // ÖNCELİK 4 (devam) — /panel/program üstündeki akademik yıl/dönem seçiciyle
  // tutarlılık: seçili bir dönem varsa, o dönemle eşleşmeyen dersler haftalık
  // grid'de gösterilmez (ör. bir Eylül haftası hem Yaz uzatmasını hem Güz
  // başlangıcını kapsayabilir — bu ayrımı netleştirir). Legacy (term=undefined)
  // dersler `lessonMatchesAcademicPeriod`'un tarih-tabanlı fallback'i ile HÂLÂ
  // doğru şekilde dahil edilir — hiçbir ders sessizce kaybolmaz. Seçim yoksa
  // (selectedTerm undefined) filtre uygulanmaz — eski davranış aynen korunur.
  /**
   * P0 performans (2026-09-07) — İYİMSER (optimistic) taşıma/süre değişimi.
   * Önceden ders kartı yalnızca sunucu cevabı geldikten SONRA yer
   * değiştiriyordu; ölçülen bırakma→görünür süre ~8 sn'ydi (server action +
   * ayrıca `router.refresh()` = İKİ tam RSC render'ı). Artık kart bırakılır
   * bırakılmaz yeni yerinde çizilir; bu harita yalnızca sunucudan gelen
   * `weekLessons` aynı değeri getirene kadar yaşar, istek başarısız olursa
   * (aşağıda) hemen silinir ve kart eski yerine döner.
   */
  const [pendingLessonMoves, setPendingLessonMoves] = useState<
    Record<string, { startAt: string; endAt: string }>
  >({});
  const effectiveWeekLessons = useMemo(
    () =>
      Object.keys(pendingLessonMoves).length === 0
        ? weekLessons
        : weekLessons.map((l) => (pendingLessonMoves[l.id] ? { ...l, ...pendingLessonMoves[l.id] } : l)),
    [weekLessons, pendingLessonMoves]
  );
  const scopedWeekLessons =
    selectedTerm && selectedAcademicYearStart
      ? effectiveWeekLessons.filter((l) => {
          const owner = students.find((s) => s.id === l.studentId);
          return lessonMatchesAcademicPeriod(l, selectedTerm, selectedAcademicYearStart, owner?.termType ?? "guz");
        })
      : effectiveWeekLessons;

  // ÖNCELİK 4 (devam) — döneme göre kapalı gün seti: Güz'de Pazartesi (eski
  // davranış, dönem seçili değilken de aynen korunur), Yaz'da Cumartesi+Pazar.
  // Kapalı günler hiçbir koşulda takvimde gün sütunu olarak görünmez — slot/
  // ders oluşturma/DnD/öneri o gün için mümkün değildir (sütun yoksa hedef de
  // yok). Mevcut dersler SİLİNMEZ (weekLessons'ta kalır, veri kaybı yok);
  // yalnızca haftalık grid'de gösterilmezler — aşağıdaki uyarı bunları listeler.
  const closedWeekdaysForGrid = selectedTerm === "yaz" ? [0, 6] : [1];
  const isClosedGridDay = (d: Date) => closedWeekdaysForGrid.includes(d.getDay());
  const visibleDays = days.filter((d) => !isClosedGridDay(parseISO(d)));
  const mondayLessons = scopedWeekLessons.filter((l) => isClosedGridDay(parseISO(l.startAt)));
  const gridWindow = computeGridWindow(workingHours, scopedWeekLessons);
  const slots = slotStarts(gridWindow.startMin, gridWindow.endMin);
  const windowStartMin = slots[0] ?? 0;

  const [activePanel, setActivePanel] = useState<ActivePanel>("none");
  const [calendarView, setCalendarView] = useState<CalendarView>("week");

  const [studentId, setStudentId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [instrument, setInstrument] = useState<Instrument>("Piyano");
  const [startAt, setStartAt] = useState("");
  const [lessonBranchId, setLessonBranchId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number>(DEFAULT_LESSON_DURATION_MINUTES);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /**
   * İş 3 — öğretmen seçilen saatte müsait görünmüyorsa (hard block değil,
   * SOFT uyarı) sunucu `overridable: true` ile başarısız döner; formu
   * kırmızı hatayla göstermek yerine onay modalı açılır. Kullanıcı "Yine
   * de planla" derse AYNI form verisiyle `overrideAvailability=true`
   * eklenerek yeniden gönderilir — onay olmadan hiçbir uyarı otomatik
   * atlanmaz (bkz. actionAddLesson/createLessonTool).
   */
  const [availabilityWarningOpen, setAvailabilityWarningOpen] = useState(false);
  const pendingLessonFormData = useRef<FormData | null>(null);
  const [notices, setNotices] = useState(() =>
    emptyProgramNotices<{ parent: LessonCommunicationMessage; teacher: LessonCommunicationMessage }>()
  );
  const { gridError, actionSuccess, lastCreated, seriesSuccess } = notices;
  const clearNotices = () => setNotices(emptyProgramNotices());

  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<LessonSlotSuggestion[] | null>(null);
  const [suggestLimit, setSuggestLimit] = useState(8);

  const [draggingLessonId, setDraggingLessonId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [resizePreview, setResizePreview] = useState<{ lessonId: string; duration: number } | null>(null);
  const resizeRef = useRef<{
    lessonId: string;
    startY: number;
    initialDuration: number;
    currentDuration: number;
  } | null>(null);

  /**
   * P0 UAT (2026-09-08) — statü değişiminde kart renginin ~10 sn gecikmesi.
   *
   * KÖK NEDEN: kart dolgusu `lessonCardStatusVisual(lesson)` ile SUNUCU
   * prop'undan çiziliyordu. `LessonOpsActions` kendi içinde iyimserdi ama bu
   * bileşene bir geri çağrı vermiyordu, dolayısıyla kart yeni rengi ancak
   * `router.refresh()` → server action + revalidation + tam-tenant
   * `readScopedData()` turu bittikten SONRA alıyordu.
   *
   * Çözüm: statü, `LessonOpsActions`'ın zaten yaydığı "etkin statü"den ANINDA
   * yerel bir katmana yazılır ve kart bu katmanla boyanır. `onStatusChange`
   * iyimser set, hata sonrası geri alma ve onaylı geçişte AYNI kaynaktan
   * tetiklendiği için rollback bedavaya gelir.
   */
  const [opsOverride, setOpsOverride] = useState<Record<string, LessonOpsFlagValue>>({});
  const [opsPending, setOpsPending] = useState<Record<string, boolean>>({});

  /**
   * 2026-09-19 — seçili ders yalnız ID olarak tutulur; ders nesnesi HER render'da
   * güncel sunucu verisinden (+ iyimser statü katmanından) türetilir. Eskiden
   * tıklama anındaki kopya saklanıyordu: yenileme sonrası panel bayat veri
   * gösteriyordu. Seçim, statü RENGİNE hiçbir koşulda dokunmaz (bkz. kart
   * `selected` vurgusu — dolgudan bağımsız çerçeve).
   */
  const [detailLessonId, setDetailLessonId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailSubmitting, setDetailSubmitting] = useState(false);

  // Program ekranına özel hızlı filtreler — istemci tarafında görünürlüğü
  // etkiler; sunucu/yetki/global şube bağlamı bu sprintin kapsamı dışında.
  const [filterBranchId, setFilterBranchId] = useState("");
  const [filterTeacherId, setFilterTeacherId] = useState("");
  const [filterStudentId, setFilterStudentId] = useState(initialStudentFilter ?? "");

  const branchIds = Object.keys(branchNames).sort((a, b) =>
    (branchNames[a] ?? "").localeCompare(branchNames[b] ?? "", "tr")
  );
  const filterableTeachers = activeTeachersForBranch(teachers, filterBranchId);
  const filterableStudents = studentsForBranch(students, filterBranchId);

  function selectFilterBranch(id: string) {
    setFilterBranchId(id);
    setFilterTeacherId((current) => resolveTeacherFilterForBranch(teachers, id, current));
    setFilterStudentId((current) => resolveStudentFilterForBranch(students, id, current));
  }

  const visibleWeekLessons = filterLessonsForCalendar(scopedWeekLessons, filterBranchId, filterTeacherId, filterStudentId);

  const selectedStudent = students.find((s) => s.id === studentId);
  const selectedTeacher = teachers.find((t) => t.id === teacherId);

  const instrumentOptions = selectedStudent?.instruments.length
    ? selectedStudent.instruments
    : (catalogInstruments?.length ? catalogInstruments : INSTRUMENTS) as Instrument[];

  const lessonStudentOptions = studentsForBranch(
    students.filter((s) => s.active),
    lessonBranchId
  );
  const teacherOptions = teacherOptionsFor(teachers, instrument, selectedStudent).filter(
    (t) => !lessonBranchId || t.branchId === lessonBranchId
  );
  const roomOptions = roomOptionsFor(rooms, instrument, selectedTeacher).filter(
    (r) => !lessonBranchId || r.branchId === lessonBranchId
  );

  // Tekrarlayan ders serisi paneli — tek ders panelinden bağımsız state.
  const [seriesBranchId, setSeriesBranchId] = useState("");
  const [seriesStudentId, setSeriesStudentId] = useState("");
  const [seriesTeacherId, setSeriesTeacherId] = useState("");
  const [seriesRoomId, setSeriesRoomId] = useState("");
  const [seriesInstrument, setSeriesInstrument] = useState<Instrument>("Piyano");
  const [seriesWeekday, setSeriesWeekday] = useState(1);
  const [seriesStartTime, setSeriesStartTime] = useState("10:00");
  const [seriesDuration, setSeriesDuration] = useState<number>(DEFAULT_LESSON_DURATION_MINUTES);
  const [seriesStartsOn, setSeriesStartsOn] = useState("");
  const [seriesEndsOn, setSeriesEndsOn] = useState("");
  const [seriesSkipConflicts, setSeriesSkipConflicts] = useState(false);
  const [seriesPreview, setSeriesPreview] = useState<{
    previewText: string;
    occurrenceCount: number;
    conflictCount: number;
    checks: SeriesOccurrenceCheck[];
  } | null>(null);
  const [seriesPreviewLoading, setSeriesPreviewLoading] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [seriesSubmitting, setSeriesSubmitting] = useState(false);

  const seriesSelectedStudent = students.find((s) => s.id === seriesStudentId);
  const seriesSelectedTeacher = teachers.find((t) => t.id === seriesTeacherId);
  const seriesInstrumentOptions = seriesSelectedStudent?.instruments.length
    ? seriesSelectedStudent.instruments
    : (catalogInstruments?.length ? catalogInstruments : INSTRUMENTS) as Instrument[];
  const seriesStudentOptions = studentsForBranch(
    students.filter((s) => s.active),
    seriesBranchId
  );
  const seriesTeacherOptions = teacherOptionsFor(teachers, seriesInstrument, seriesSelectedStudent).filter(
    (t) => !seriesBranchId || t.branchId === seriesBranchId
  );
  const seriesRoomOptions = roomOptionsFor(rooms, seriesInstrument, seriesSelectedTeacher).filter(
    (r) => !seriesBranchId || r.branchId === seriesBranchId
  );

  function resetPanelState() {
    clearNotices();
    setFormError(null);
    setSuggestions(null);
    setSuggestError(null);
  }

  function openPlanner(prefillStartAt?: string) {
    if (!canCreate) {
      setNotices(onlyNotice({ gridError: "Ders eklemek için üstteki kurum seçiciden tek bir kurum seçin." }));
      return;
    }
    resetPanelState();
    setDetailLessonId(null);
    setActivePanel("create");
    if (prefillStartAt) setStartAt(prefillStartAt);
    if (filterBranchId) setLessonBranchId(filterBranchId);
    if (filterTeacherId) {
      const teacher = teachers.find((t) => t.id === filterTeacherId);
      if (teacher) {
        setTeacherId(filterTeacherId);
        setInstrument(teacher.instruments[0] ?? "Piyano");
        setRoomId("");
        setLessonBranchId(teacher.branchId);
      }
    }
  }

  function openPlannerAtSlot(dayIso: string, slotMin: number) {
    const day = parseISO(dayIso);
    const dt = addMinutes(startOfDay(day), slotMin);
    openPlanner(format(dt, "yyyy-MM-dd'T'HH:mm"));
  }

  function selectStudent(id: string) {
    setStudentId(id);
    const student = students.find((s) => s.id === id);
    if (student) {
      setInstrument(student.instruments[0] ?? "Piyano");
      setTeacherId(student.teacherId);
      setLessonBranchId(student.branchId);
    }
  }

  function selectInstrument(value: string) {
    setInstrument(value as Instrument);
    setRoomId("");
  }

  function selectTeacher(id: string) {
    setTeacherId(id);
    setRoomId("");
  }

  /** Şube değişince o şubeyle uyumsuz kalan öğrenci/öğretmen/oda seçimi sıfırlanır. */
  function selectLessonBranch(id: string) {
    setLessonBranchId(id);
    setStudentId((current) => resolveStudentFilterForBranch(students, id, current));
    setTeacherId((current) => resolveTeacherFilterForBranch(teachers, id, current));
    setRoomId((current) => resolveRoomFilterForBranch(rooms, id, current));
  }

  function openSeriesPanel() {
    if (!canCreate) {
      setNotices(onlyNotice({ gridError: "Ders eklemek için üstteki kurum seçiciden tek bir kurum seçin." }));
      return;
    }
    setSeriesError(null);
    setSeriesPreview(null);
    clearNotices();
    setDetailLessonId(null);
    setActivePanel("series");
    if (filterBranchId) setSeriesBranchId(filterBranchId);
  }

  /** Şube değişince o şubeyle uyumsuz kalan öğrenci/öğretmen/oda seçimi sıfırlanır. */
  function selectSeriesBranch(id: string) {
    setSeriesBranchId(id);
    setSeriesPreview(null);
    setSeriesStudentId((current) => resolveStudentFilterForBranch(students, id, current));
    setSeriesTeacherId((current) => resolveTeacherFilterForBranch(teachers, id, current));
    setSeriesRoomId((current) => resolveRoomFilterForBranch(rooms, id, current));
  }

  function selectSeriesStudent(id: string) {
    setSeriesStudentId(id);
    setSeriesPreview(null);
    const student = students.find((s) => s.id === id);
    if (student) {
      setSeriesInstrument(student.instruments[0] ?? "Piyano");
      setSeriesTeacherId(student.teacherId);
      setSeriesBranchId(student.branchId);
    }
  }

  function selectSeriesInstrument(value: string) {
    setSeriesInstrument(value as Instrument);
    setSeriesRoomId("");
    setSeriesPreview(null);
  }

  function selectSeriesTeacher(id: string) {
    setSeriesTeacherId(id);
    setSeriesRoomId("");
    setSeriesPreview(null);
  }

  async function handleSeriesPreview() {
    setSeriesError(null);
    clearNotices();
    if (!seriesBranchId || !seriesStudentId || !seriesTeacherId || !seriesRoomId || !seriesStartsOn || !seriesEndsOn) {
      setSeriesError("Şube, öğrenci, öğretmen, oda ve tarih aralığı zorunludur.");
      return;
    }
    setSeriesPreviewLoading(true);
    const result = await actionPreviewLessonSeries({
      studentId: seriesStudentId,
      teacherId: seriesTeacherId,
      roomId: seriesRoomId,
      branchId: seriesBranchId,
      instrument: seriesInstrument,
      weekday: seriesWeekday,
      startTime: seriesStartTime,
      durationMinutes: seriesDuration,
      startsOn: seriesStartsOn,
      endsOn: seriesEndsOn,
    });
    setSeriesPreviewLoading(false);
    if (!result.ok) {
      setSeriesError(result.message);
      return;
    }
    setSeriesPreview(result);
  }

  async function handleSeriesCreate() {
    if (!seriesPreview) return;
    if (seriesPreview.conflictCount > 0 && !seriesSkipConflicts) {
      setSeriesError(
        "Çakışma var — devam etmek için \"yalnızca çakışmayan tarihleri oluştur\" seçeneğini işaretleyin."
      );
      return;
    }
    setSeriesSubmitting(true);
    setSeriesError(null);
    const result = await actionCreateLessonSeries({
      studentId: seriesStudentId,
      teacherId: seriesTeacherId,
      roomId: seriesRoomId,
      branchId: seriesBranchId,
      instrument: seriesInstrument,
      weekday: seriesWeekday,
      startTime: seriesStartTime,
      durationMinutes: seriesDuration,
      startsOn: seriesStartsOn,
      endsOn: seriesEndsOn,
      skipConflicts: seriesSkipConflicts,
      // ÖNCELİK 4 (devam) — yeni seri, program ekranında seçili akademik yıl/dönemi devralır.
      term: selectedTerm,
      academicYearStart: selectedAcademicYearStart,
    });
    setSeriesSubmitting(false);
    if (!result.ok) {
      setSeriesError(result.message);
      return;
    }
    setNotices(
      onlyNotice({
        seriesSuccess: { createdCount: result.createdLessonIds.length, skippedCount: result.skippedOccurrences.length },
      })
    );
    setSeriesPreview(null);
    setActivePanel("none");
    router.refresh();
  }

  async function handleFindSlots() {
    setSuggestError(null);
    if (!studentId) {
      setSuggestError("Uygun saat aramak için önce öğrenci seçin.");
      return;
    }
    setSuggestLoading(true);
    const result = await actionSuggestLessonSlots({
      studentId,
      instrument,
      teacherId: teacherId || undefined,
      maxSlots: suggestLimit,
    });
    setSuggestLoading(false);
    if (!result.ok) {
      setSuggestError(result.message);
      return;
    }
    setSuggestions(result.suggestions);
  }

  function applySuggestion(s: LessonSlotSuggestion) {
    setTeacherId(s.teacherId);
    setRoomId(s.roomId);
    setLessonBranchId(s.branchId);
    setStartAt(toDatetimeLocalValue(s.startAt));
    setSuggestions(null);
  }

  async function submitLessonForm(fd: FormData) {
    setSubmitting(true);
    const result = await actionAddLesson(fd);
    setSubmitting(false);
    if (!result.ok) {
      if (result.overridable) {
        // Hard error göstermek yerine onay modalı aç — kullanıcı karar versin.
        pendingLessonFormData.current = fd;
        setAvailabilityWarningOpen(true);
        return;
      }
      setFormError(result.message);
      return;
    }
    setNotices(
      result.communication ? onlyNotice({ lastCreated: result.communication }) : onlyNotice({ actionSuccess: "Ders planlandı." })
    );
    setActivePanel("none");
    setSuggestions(null);
    setAvailabilityWarningOpen(false);
    pendingLessonFormData.current = null;
    router.refresh();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!lessonBranchId || !studentId || !teacherId || !roomId || !startAt) {
      setFormError("Şube, öğrenci, öğretmen, oda ve tarih/saat seçimi zorunludur.");
      return;
    }
    const fd = new FormData();
    fd.set("studentId", studentId);
    fd.set("teacherId", teacherId);
    fd.set("roomId", roomId);
    fd.set("instrument", instrument);
    fd.set("startAt", startAt);
    fd.set("durationMinutes", String(durationMinutes));
    // ÖNCELİK 4 (devam) — yeni tek ders, program ekranında seçili akademik yıl/dönemi devralır.
    if (selectedTerm) fd.set("term", selectedTerm);
    if (selectedAcademicYearStart) fd.set("academicYearStart", String(selectedAcademicYearStart));
    await submitLessonForm(fd);
  }

  async function confirmAvailabilityOverride() {
    const fd = pendingLessonFormData.current;
    if (!fd) return;
    fd.set("overrideAvailability", "true");
    setAvailabilityWarningOpen(false);
    await submitLessonForm(fd);
  }

  function cancelAvailabilityOverride() {
    setAvailabilityWarningOpen(false);
    pendingLessonFormData.current = null;
  }

  /**
   * Sunucu verisi yakaladığında override DÜŞÜRÜLÜR — aksi hâlde eski bir
   * iyimser değer sonradan gelen sunucu gerçeğini kalıcı maskelerdi. Sunucu
   * HENÜZ yakalamadıysa override KORUNUR, yani başarılı yanıt iyimser durumu
   * eski propla EZMEZ. (Effect değil; React'in "render sırasında state ayarla"
   * deseni — effect içinde senkron setState zincirleme render tetikler.)
   */
  const prunedOverrides = pruneSettledOverrides(opsOverride, weekLessons);
  if (prunedOverrides !== opsOverride) setOpsOverride(prunedOverrides);

  const detailLessonRaw = detailLessonId ? (effectiveWeekLessons.find((l) => l.id === detailLessonId) ?? null) : null;
  const detailLesson = detailLessonRaw ? applyOpsOverride(detailLessonRaw, prunedOverrides[detailLessonRaw.id]) : null;

  function onOpsStatusChange(lessonId: string, flag: LessonOpsFlagValue) {
    setOpsOverride((prev) => ({ ...prev, [lessonId]: flag }));
  }

  function onOpsPendingChange(lessonId: string, pending: boolean) {
    setOpsPending((prev) => {
      if (!pending) {
        if (!prev[lessonId]) return prev;
        const next = { ...prev };
        delete next[lessonId];
        return next;
      }
      return prev[lessonId] ? prev : { ...prev, [lessonId]: true };
    });
  }

  function openDetail(lesson: Lesson) {
    setActivePanel("none");
    setDetailLessonId(lesson.id);
    setDetailError(null);
  }

  function closeDetail() {
    setDetailLessonId(null);
    setDetailError(null);
  }

  async function submitDetailCancel() {
    if (!detailLesson) return;
    if (!canCreate) {
      setDetailError("Ders iptal etmek için üstteki kurum seçiciden tek bir kurum seçin.");
      return;
    }
    if (!window.confirm("Bu dersi iptal etmek istediğinize emin misiniz?")) return;
    setDetailSubmitting(true);
    setDetailError(null);
    const result = await actionCancelLesson({ lessonId: detailLesson.id });
    setDetailSubmitting(false);
    if (!result.ok) {
      setDetailError(result.message);
      return;
    }
    closeDetail();
    setNotices(onlyNotice({ actionSuccess: "Ders iptal edildi." }));
    router.refresh();
  }

  async function submitCancelSeriesFromLesson() {
    if (!detailLesson) return;
    if (!canCreate) {
      setDetailError("Seri iptali için üstteki kurum seçiciden tek bir kurum seçin.");
      return;
    }
    if (
      !window.confirm(
        "Bu ders ve bu tarihten sonraki tüm seri dersleri iptal edilecek. Geçmiş dersler etkilenmez. Emin misiniz?"
      )
    )
      return;
    setDetailSubmitting(true);
    setDetailError(null);
    const result = await actionCancelSeriesFromLesson({ lessonId: detailLesson.id });
    setDetailSubmitting(false);
    if (!result.ok) {
      setDetailError(result.message);
      return;
    }
    closeDetail();
    setNotices(onlyNotice({ actionSuccess: "Bu ders ve sonraki seri dersleri iptal edildi." }));
    router.refresh();
  }

  async function submitCancelEntireSeries() {
    if (!detailLesson?.seriesId) return;
    if (!canCreate) {
      setDetailError("Seri iptali için üstteki kurum seçiciden tek bir kurum seçin.");
      return;
    }
    if (
      !window.confirm(
        "Bu serinin tamamı iptal edilecek (geçmiş dersler korunur, gelecekteki tüm dersler iptal olur). Emin misiniz?"
      )
    )
      return;
    setDetailSubmitting(true);
    setDetailError(null);
    const result = await actionCancelEntireSeries({ seriesId: detailLesson.seriesId });
    setDetailSubmitting(false);
    if (!result.ok) {
      setDetailError(result.message);
      return;
    }
    closeDetail();
    setNotices(onlyNotice({ actionSuccess: "Serinin kalan dersleri iptal edildi." }));
    router.refresh();
  }

  async function performMove(lessonId: string, newStartAtIso: string) {
    if (!canCreate) {
      setNotices(onlyNotice({ gridError: "Ders taşımak için üstteki kurum seçiciden tek bir kurum seçin." }));
      return;
    }
    clearNotices();
    const lesson = weekLessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    // İyimser çizim — sunucu turunu BEKLEMEDEN. Süre korunur; yalnızca başlangıç taşınır.
    const durationMs = parseISO(lesson.endAt).getTime() - parseISO(lesson.startAt).getTime();
    setPendingLessonMoves((prev) => ({
      ...prev,
      [lessonId]: {
        startAt: newStartAtIso,
        endAt: new Date(new Date(newStartAtIso).getTime() + durationMs).toISOString(),
      },
    }));
    const result = await actionUpdateLessonSchedule({ lessonId, startAt: newStartAtIso });
    // İyimser kayıt burada HER DURUMDA düşer: başarıda sunucu gerçeği zaten
    // action yanıtıyla birlikte geldi (revalidatePath), hatada ise kart eski
    // yerine döner — güvenli geri alma. Kayıt bırakılırsa ders başka bir
    // yerden (seri iptali, başka sekme) değişse bile bu harita onu ezerdi.
    setPendingLessonMoves((prev) => {
      const next = { ...prev };
      delete next[lessonId];
      return next;
    });
    if (!result.ok) {
      setNotices(onlyNotice({ gridError: `Değişiklik uygulanmadı: ${result.message}` }));
      return;
    }
    setNotices(onlyNotice({ actionSuccess: "Ders taşındı." }));
    // `router.refresh()` YOK — `actionUpdateLessonSchedule` içindeki
    // `revalidatePath` zaten bu sayfanın RSC ağacını action yanıtıyla birlikte
    // tazeliyor (bkz. Next docs: revalidatePath > Server Functions). Ek
    // `refresh()` İKİNCİ bir tam sayfa render'ıydı — ölçülen maliyeti ~1,5 sn.
  }

  function handleDrop(dayIso: string, slotMin: number) {
    setDragOverKey(null);
    const lessonId = draggingLessonId;
    setDraggingLessonId(null);
    if (!lessonId) return;
    const dt = zonedWallTimeToUtc(format(parseISO(dayIso), "yyyy-MM-dd"), formatMinutes(slotMin));
    void performMove(lessonId, dt.toISOString());
  }

  function startResize(e: React.MouseEvent, lesson: Lesson) {
    e.preventDefault();
    e.stopPropagation();
    if (!canCreate) {
      setNotices(onlyNotice({ gridError: "Ders süresini değiştirmek için üstteki kurum seçiciden tek bir kurum seçin." }));
      return;
    }
    const duration = differenceInMinutes(parseISO(lesson.endAt), parseISO(lesson.startAt));
    resizeRef.current = { lessonId: lesson.id, startY: e.clientY, initialDuration: duration, currentDuration: duration };
    setResizePreview({ lessonId: lesson.id, duration });

    function onMove(ev: MouseEvent) {
      const ref = resizeRef.current;
      if (!ref) return;
      const deltaY = ev.clientY - ref.startY;
      const deltaSlots = Math.round(deltaY / SLOT_HEIGHT_PX);
      const newDuration = Math.max(SLOT_MINUTES, ref.initialDuration + deltaSlots * SLOT_MINUTES);
      ref.currentDuration = newDuration;
      setResizePreview({ lessonId: ref.lessonId, duration: newDuration });
    }

    async function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const ref = resizeRef.current;
      resizeRef.current = null;
      setResizePreview(null);
      if (!ref) return;
      if (ref.currentDuration === ref.initialDuration) return;
      clearNotices();
      const moved = weekLessons.find((l) => l.id === ref.lessonId);
      if (moved) {
        setPendingLessonMoves((prev) => ({
          ...prev,
          [ref.lessonId]: {
            startAt: moved.startAt,
            endAt: new Date(parseISO(moved.startAt).getTime() + ref.currentDuration * 60_000).toISOString(),
          },
        }));
      }
      const result = await actionUpdateLessonSchedule({
        lessonId: ref.lessonId,
        durationMinutes: ref.currentDuration,
      });
      setPendingLessonMoves((prev) => {
        const next = { ...prev };
        delete next[ref.lessonId];
        return next;
      });
      if (!result.ok) {
        setNotices(onlyNotice({ gridError: `Değişiklik uygulanmadı: ${result.message}` }));
        return;
      }
      setNotices(onlyNotice({ actionSuccess: "Ders süresi güncellendi." }));
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const createLessonForm = (
    <>
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>Şube</Label>
          <Select value={lessonBranchId} onChange={(e) => selectLessonBranch(e.target.value)} required>
            <option value="">Seçin…</option>
            {branchIds.map((id) => (
              <option key={id} value={id}>
                {branchNames[id] ?? id}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Öğrenci</Label>
          <Select value={studentId} onChange={(e) => selectStudent(e.target.value)} required>
            <option value="">Seçin…</option>
            {lessonStudentOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Enstrüman</Label>
          <Select value={instrument} onChange={(e) => selectInstrument(e.target.value)}>
            {instrumentOptions.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Öğretmen</Label>
          <Select value={teacherId} onChange={(e) => selectTeacher(e.target.value)} required>
            <option value="">Seçin…</option>
            {teacherOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {selectedStudent?.teacherId === t.id ? " · mevcut öğretmen" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Oda</Label>
          <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} required>
            <option value="">Seçin…</option>
            {roomOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Süre</Label>
          <Select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
            {LESSON_DURATION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} dakika
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Başlangıç tarihi/saati</Label>
          <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
          {startAt && (wallDateTimeInputToIso(startAt) ?? "") < now.toISOString() ? (
            <p className="mt-1 text-xs font-medium text-amber-700">
              Geçmiş tarihli ders planlıyorsunuz — ders programa ve yoklama takvimine bu tarihle eklenir.
            </p>
          ) : null}
        </div>
        <div className="flex items-end gap-2">
          <Button type="button" variant="secondary" onClick={handleFindSlots} disabled={suggestLoading}>
            {suggestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Uygun saatleri bul
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Dersi planla
          </Button>
        </div>

        {formError ? <p className="sm:col-span-2 lg:col-span-3 text-sm text-rose-600">{formError}</p> : null}
      </form>

      {availabilityWarningOpen ? (
        <FormModal title="Öğretmen müsait görünmüyor" onClose={cancelAvailabilityOverride}>
          <p className="text-sm text-[var(--color-text)] dark:text-slate-200">
            Öğretmen bu saatte müsait görünmüyor. Yine de planlamak istiyor musunuz?
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
            Seçilen saat, öğretmenin bildirdiği çalışma saatlerinin dışında. Bu ders yine de
            oluşturulursa &quot;müsaitlik dışı&quot; olarak işaretlenir ve raporlarda görünür.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={cancelAvailabilityOverride} disabled={submitting}>
              Vazgeç
            </Button>
            <Button type="button" variant="danger" onClick={() => void confirmAvailabilityOverride()} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Yine de planla
            </Button>
          </div>
        </FormModal>
      ) : null}

      {suggestError ? <p className="mt-3 text-sm text-rose-600">{suggestError}</p> : null}

      {suggestions ? (
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          <p className="mb-3 text-sm font-medium text-[var(--color-text-muted)] dark:text-slate-300">
            Uygun saatler {suggestions.length === 0 ? "bulunamadı" : `(${suggestions.length})`}
          </p>
          {suggestions.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Önümüzdeki günlerde bu öğrenci/enstrüman için boş bir saat bulunamadı.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {suggestions.map((s) => {
                const teacher = teachers.find((t) => t.id === s.teacherId);
                const room = rooms.find((r) => r.id === s.roomId);
                return (
                  <button
                    key={`${s.startAt}-${s.teacherId}-${s.roomId}`}
                    type="button"
                    onClick={() => applySuggestion(s)}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left text-xs hover:border-amber-300 hover:bg-amber-50"
                  >
                    <p className="font-semibold text-[var(--color-text)] dark:text-slate-50">{format(toWallClockDate(s.startAt), "d MMM, EEEE", { locale: tr })}</p>
                    <p className="text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{format(toWallClockDate(s.startAt), "HH:mm")}</p>
                    <p className="mt-1 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                      {teacher?.name} · {room?.name}
                    </p>
                    <p className="mt-1 text-[11px] text-amber-600">{s.reasons.join(" · ")}</p>
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setSuggestLimit((n) => n + 8);
              void handleFindSlots();
            }}
            className="mt-3 text-xs font-medium text-amber-600 hover:text-amber-700"
          >
            Daha fazla göster
          </button>
        </div>
      ) : null}
    </>
  );

  const seriesForm = (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>Şube</Label>
          <Select value={seriesBranchId} onChange={(e) => selectSeriesBranch(e.target.value)} required>
            <option value="">Seçin…</option>
            {branchIds.map((id) => (
              <option key={id} value={id}>
                {branchNames[id] ?? id}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Öğrenci</Label>
          <Select value={seriesStudentId} onChange={(e) => selectSeriesStudent(e.target.value)} required>
            <option value="">Seçin…</option>
            {seriesStudentOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Enstrüman</Label>
          <Select value={seriesInstrument} onChange={(e) => selectSeriesInstrument(e.target.value)}>
            {seriesInstrumentOptions.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Öğretmen</Label>
          <Select value={seriesTeacherId} onChange={(e) => selectSeriesTeacher(e.target.value)} required>
            <option value="">Seçin…</option>
            {seriesTeacherOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {seriesSelectedStudent?.teacherId === t.id ? " · mevcut öğretmen" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Oda</Label>
          <Select
            value={seriesRoomId}
            onChange={(e) => {
              setSeriesRoomId(e.target.value);
              setSeriesPreview(null);
            }}
            required
          >
            <option value="">Seçin…</option>
            {seriesRoomOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Gün</Label>
          <Select
            value={seriesWeekday}
            onChange={(e) => {
              setSeriesWeekday(Number(e.target.value));
              setSeriesPreview(null);
            }}
          >
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>
                Her {dayName(d)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Başlangıç saati</Label>
          <Input
            type="time"
            value={seriesStartTime}
            onChange={(e) => {
              setSeriesStartTime(e.target.value);
              setSeriesPreview(null);
            }}
            required
          />
        </div>
        <div>
          <Label>Süre</Label>
          <Select
            value={seriesDuration}
            onChange={(e) => {
              setSeriesDuration(Number(e.target.value));
              setSeriesPreview(null);
            }}
          >
            {LESSON_DURATION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} dakika
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Başlangıç tarihi</Label>
          <Input
            type="date"
            value={seriesStartsOn}
            onChange={(e) => {
              setSeriesStartsOn(e.target.value);
              setSeriesPreview(null);
            }}
            required
          />
        </div>
        <div>
          <Label>Bitiş tarihi</Label>
          <Input
            type="date"
            value={seriesEndsOn}
            onChange={(e) => {
              setSeriesEndsOn(e.target.value);
              setSeriesPreview(null);
            }}
            required
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={handleSeriesPreview} disabled={seriesPreviewLoading}>
          {seriesPreviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Önizle
        </Button>
        {seriesPreview ? (
          <Button
            type="button"
            onClick={handleSeriesCreate}
            disabled={(seriesPreview.conflictCount > 0 && !seriesSkipConflicts) || seriesSubmitting}
          >
            {seriesSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Seriyi oluştur
          </Button>
        ) : null}
      </div>

      {seriesError ? <p className="mt-3 text-sm text-rose-600">{seriesError}</p> : null}

      {seriesPreview ? (
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          <p className="text-sm font-medium text-[var(--color-text-muted)] dark:text-slate-300">{seriesPreview.previewText}</p>
          {seriesPreview.conflictCount > 0 ? (
            <div className="mt-3">
              <p className="text-sm font-medium text-rose-700">{seriesPreview.conflictCount} tarihte çakışma var:</p>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-rose-50 p-2 text-xs text-rose-800">
                {seriesPreview.checks
                  .filter((c) => !c.ok)
                  .map((c) => (
                    <p key={c.startAt}>
                      {format(toWallClockDate(c.startAt), "d MMM yyyy, HH:mm", { locale: tr })} — {c.message}
                    </p>
                  ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                <input
                  type="checkbox"
                  checked={seriesSkipConflicts}
                  onChange={(e) => setSeriesSkipConflicts(e.target.checked)}
                />
                Yalnızca çakışmayan tarihleri oluştur, çakışanları atla
              </label>
            </div>
          ) : (
            <p className="mt-2 text-xs text-emerald-600">Çakışma yok — oluşturmaya hazır.</p>
          )}
        </div>
      ) : null}
    </>
  );

  return (
    <div>
      {lastCreated ? (
        <Card className="mb-4 border-emerald-200 bg-emerald-50/50">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold text-emerald-900">Ders planlandı. İletişim taslakları hazır.</p>
            <button
              type="button"
              onClick={() => clearNotices()}
              className="text-emerald-700 hover:text-emerald-900"
              aria-label="Kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-3 text-xs text-emerald-800">
            Hiçbir mesaj otomatik gönderilmedi. Aşağıdaki taslakları inceleyip isterseniz WhatsApp&apos;ta açabilirsiniz.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <CommunicationDraftCard label="Veliye taslak" msg={lastCreated.parent} />
            <CommunicationDraftCard label="Öğretmene taslak" msg={lastCreated.teacher} />
          </div>
        </Card>
      ) : null}

      {seriesSuccess ? (
        <Card className="mb-4 border-emerald-200 bg-emerald-50/50">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-emerald-800">
              {seriesSuccess.createdCount} ders oluşturuldu
              {seriesSuccess.skippedCount > 0 ? `, ${seriesSuccess.skippedCount} tarih çakışma nedeniyle atlandı` : ""}.
            </p>
            <button
              type="button"
              onClick={() => clearNotices()}
              className="text-emerald-700 hover:text-emerald-900"
              aria-label="Kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </Card>
      ) : null}

      {actionSuccess ? (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <span>{actionSuccess}</span>
          <button type="button" onClick={() => clearNotices()} aria-label="Kapat">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {gridError ? (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          <span>{gridError}</span>
          <button type="button" onClick={() => clearNotices()} aria-label="Kapat">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {mondayLessons.length > 0 ? (
        <div className="mb-3 rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger)]">
          <p className="font-medium">
            {selectedTerm === "yaz" ? "Okul Yaz döneminde Cumartesi/Pazar kapalı" : "Okul Güz döneminde Pazartesi kapalı"} —
            bu haftada {mondayLessons.length} ders hâlâ kapalı bir güne planlanmış ve takvimde gösterilmiyor (veri silinmedi).
          </p>
          <p className="mt-1 text-[var(--color-text-muted)]">
            Bu dersleri başka bir güne taşımak için öğrenci/öğretmen üzerinden ders detayını açın; yeni
            kapalı gün planlaması artık engellenir.
          </p>
        </div>
      ) : null}

      {selectedTerm && selectedAcademicYearStart && visibleWeekLessons.length === 0 ? (
        <div className="mb-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
          Seçili akademik dönemde ({selectedTerm === "yaz" ? `${selectedAcademicYearStart} Yaz` : `${selectedAcademicYearStart}–${selectedAcademicYearStart + 1} Güz`}) bu hafta için ders yok.
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="font-semibold text-[var(--color-text)] dark:text-slate-50">Haftalık program</h2>
            <p className="mt-0.5 hidden text-xs text-[var(--color-text-muted)] lg:block">
              Dersi taşımak için sürükleyin · Süreyi değiştirmek için kartın altından uzatın
            </p>
          </div>
          <div
            role="group"
            aria-label="Takvim görünümü"
            className="inline-flex rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-0.5 dark:border-slate-700 dark:bg-slate-900"
          >
            <button
              type="button"
              aria-pressed={calendarView === "day"}
              onClick={() => setCalendarView("day")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                calendarView === "day"
                  ? "bg-[var(--color-surface)] text-amber-700 shadow-sm dark:bg-slate-700 dark:text-amber-300"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] dark:hover:text-slate-200"
              }`}
            >
              Gün görünümü
            </button>
            <button
              type="button"
              aria-pressed={calendarView === "week"}
              onClick={() => setCalendarView("week")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                calendarView === "week"
                  ? "bg-[var(--color-surface)] text-amber-700 shadow-sm dark:bg-slate-700 dark:text-amber-300"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] dark:hover:text-slate-200"
              }`}
            >
              Haftalık görünüm
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterBranchId} onChange={(e) => selectFilterBranch(e.target.value)} className="w-auto">
            <option value="">Tüm şubeler</option>
            {branchIds.map((id) => (
              <option key={id} value={id}>
                {branchNames[id]}
              </option>
            ))}
          </Select>
          <Select value={filterTeacherId} onChange={(e) => setFilterTeacherId(e.target.value)} className="w-auto">
            <option value="">Tüm öğretmenler</option>
            {filterableTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select value={filterStudentId} onChange={(e) => setFilterStudentId(e.target.value)} className="w-auto">
            <option value="">Tüm öğrenciler</option>
            {filterableStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={openSeriesPanel} disabled={!canCreate}>
            Tekrarlayan ders oluştur
          </Button>
          <Button onClick={() => openPlanner()} disabled={!canCreate}>
            Ders planla
          </Button>
        </div>
      </div>

      {!canCreate ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          &quot;Tüm kurumlar&quot; görünümündesiniz — yeni ders eklemek için üstteki kurum seçiciden tek bir kurum seçin.
        </p>
      ) : null}

      {visibleWeekLessons.length === 0 && (filterBranchId || filterTeacherId || filterStudentId) ? (
        <Card className="mb-4 border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] text-center">
          <p className="text-sm text-[var(--color-text-muted)]">Bu filtrelerle eşleşen ders yok.</p>
        </Card>
      ) : null}

      {activePanel === "create" ? (
        <FormModal title="Ders planla" onClose={() => setActivePanel("none")}>
          {createLessonForm}
        </FormModal>
      ) : null}

      {activePanel === "series" ? (
        <FormModal title="Tekrarlayan ders oluştur" onClose={() => setActivePanel("none")}>
          {seriesForm}
        </FormModal>
      ) : null}


      {/* Takvim + seçili ders paneli: geniş ekranda yan yana (tıklanan kart görünür kalır). */}
      <div className="lg:flex lg:items-start lg:gap-4">
        {detailLesson ? (
          <aside
            aria-label="Seçili ders"
            className="mb-4 lg:order-2 lg:mb-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-[400px] lg:shrink-0 lg:overflow-y-auto"
          >
        <DetailPanel
          key={detailLesson.id}
          lesson={detailLesson}
          canCreate={canCreate}
          student={students.find((s) => s.id === detailLesson.studentId)}
          teacher={teachers.find((t) => t.id === detailLesson.teacherId)}
          room={rooms.find((r) => r.id === detailLesson.roomId)}
          branchName={branchNames[detailLesson.branchId]}
          now={now}
          submitting={detailSubmitting}
          error={detailError}
          onClose={closeDetail}
          onEditDone={(message) => {
            closeDetail();
            setNotices(onlyNotice({ actionSuccess: message }));
            router.refresh();
          }}
          onOpsStatusChange={onOpsStatusChange}
          onOpsPendingChange={onOpsPendingChange}
          onCancelLesson={submitDetailCancel}
          onCancelSeriesFromLesson={submitCancelSeriesFromLesson}
          onCancelEntireSeries={submitCancelEntireSeries}
          allTeachers={teachers}
          allRooms={rooms}
          branchNames={branchNames}
        />
          </aside>
        ) : null}
      <div className="min-w-0 lg:order-1 lg:flex-1">
      {calendarView === "week" ? (
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
        <div className="flex sticky top-0 z-10 bg-[var(--color-surface)]">
          <div className="w-16 shrink-0 border-b border-r border-[var(--color-border-strong)]" />
          {visibleDays.map((dayIso) => {
            const day = parseISO(dayIso);
            const today = isSameDay(day, now);
            const holidayName = fixedHolidayName(day);
            return (
              <div
                key={dayIso}
                className={`flex-1 border-b border-l border-[var(--color-border-strong)] px-2 py-2.5 text-[13px] font-bold ${
                  holidayName
                    ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                    : today
                      ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-text)]"
                      : "text-[var(--color-text)]"
                }`}
                title={holidayName ?? undefined}
              >
                {format(day, "EEEE", { locale: tr })}
                <span className="ml-1 font-normal text-[var(--color-text-muted)]">{format(day, "d MMM", { locale: tr })}</span>
                {holidayName ? <span className="ml-1 font-normal">· Resmî tatil</span> : null}
              </div>
            );
          })}
        </div>

        <div className="flex">
          <div className="sticky left-0 z-[5] w-16 shrink-0 bg-[var(--color-surface)]">
            {slots.map((min) => {
              const onHour = min % 60 === 0;
              return (
                <div
                  key={min}
                  className={`border-r pr-2 text-right ${
                    onHour
                      ? "border-[var(--color-border-strong)] text-[13px] font-semibold text-[var(--color-text)]"
                      : "border-[var(--color-border)] text-[10px] text-[var(--color-text-muted)]"
                  }`}
                  style={{ height: SLOT_HEIGHT_PX }}
                >
                  {onHour ? formatMinutes(min) : min % 30 === 0 ? formatMinutes(min) : ""}
                </div>
              );
            })}
          </div>

          {visibleDays.map((dayIso) => {
            const day = parseISO(dayIso);
            const today = isSameDay(day, now);
            const dayLessons = visibleWeekLessons.filter((l) => isSameDay(parseISO(l.startAt), day));
            const { laneOf, laneCount } = assignLanes(dayLessons);
            const totalHeight = slots.length * SLOT_HEIGHT_PX;

            return (
              <div
                key={dayIso}
                className={`relative flex-1 border-l border-[var(--color-border-strong)] ${today ? "bg-[var(--color-primary-soft)]/30" : ""}`}
                style={{ height: totalHeight }}
              >
                {slots.map((min, i) => {
                  const key = `${dayIso}|${min}`;
                  const isDragOver = dragOverKey === key;
                  const onHour = min % 60 === 0;
                  return (
                    <button
                      key={min}
                      type="button"
                      onClick={() => openPlannerAtSlot(dayIso, min)}
                      onDragOver={(e) => {
                        if (draggingLessonId) e.preventDefault();
                        setDragOverKey(key);
                      }}
                      onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(dayIso, min);
                      }}
                      className={`absolute left-0 right-0 border-b text-[10px] text-transparent hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]/40 hover:text-[var(--color-primary)] ${
                        isDragOver
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                          : onHour
                            ? "border-[var(--color-border-strong)]"
                            : "border-dashed border-[var(--color-border)]"
                      }`}
                      style={{ top: i * SLOT_HEIGHT_PX, height: SLOT_HEIGHT_PX }}
                      aria-label={`${format(day, "d MMM", { locale: tr })} ${formatMinutes(min)} — ders planla`}
                    >
                      +
                    </button>
                  );
                })}

                {dayLessons.map((lesson) => {
                  const student = students.find((s) => s.id === lesson.studentId);
                  const teacher = teachers.find((t) => t.id === lesson.teacherId);
                  const startMin = minutesOfDay(lesson.startAt);
                  const duration =
                    resizePreview?.lessonId === lesson.id
                      ? resizePreview.duration
                      : differenceInMinutes(parseISO(lesson.endAt), parseISO(lesson.startAt));
                  const top = ((startMin - windowStartMin) / SLOT_MINUTES) * SLOT_HEIGHT_PX;
                  const height = Math.max((duration / SLOT_MINUTES) * SLOT_HEIGHT_PX - 2, SLOT_HEIGHT_PX - 2);
                  const lane = laneOf.get(lesson.id) ?? 0;
                  const widthPct = 100 / laneCount;
                  const editable = canMoveOrResize(lesson, now) && canCreate;

                  const tier = lessonCardTier(height);
                  const room = rooms.find((r) => r.id === lesson.roomId);
                  const statusVisual = lessonCardStatusVisual(applyOpsOverride(lesson, prunedOverrides[lesson.id]), now);
                  const selected = detailLessonId === lesson.id;

                  return (
                    <div
                      key={lesson.id}
                      aria-current={selected ? "true" : undefined}
                      data-selected={selected ? "true" : undefined}
                      draggable={editable}
                      onDragStart={() => setDraggingLessonId(lesson.id)}
                      onDragEnd={() => {
                        setDraggingLessonId(null);
                        setDragOverKey(null);
                      }}
                      onClick={() => openDetail(lesson)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openDetail(lesson);
                        }
                        // Escape: klavye odağını bırak — açık hover kartı kapanır
                        // (UAT: "bilgi notu ekranda takılı kalıyor").
                        if (e.key === "Escape") e.currentTarget.blur();
                      }}
                      aria-label={lessonAccessibleLabel(lesson, student, teacher, room, branchNames[lesson.branchId])}
                      aria-busy={opsPending[lesson.id] ? true : undefined}
                      className={`group absolute z-[1] flex flex-col rounded-md border border-[var(--color-border-strong)] p-1.5 text-[10px] shadow-[var(--shadow-sm)] transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-focus-ring)] hover:z-[20] ${
                        opsPending[lesson.id] ? "animate-pulse ring-2 ring-[var(--color-focus-ring)] ring-offset-1" : ""
                      } ${
                        editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                      } ${selected ? LESSON_SELECTED_CLASS : ""} ${draggingLessonId === lesson.id ? "opacity-60 ring-2 ring-[var(--color-primary)]" : ""}`}
                      style={{
                        top,
                        height,
                        left: `${lane * widthPct}%`,
                        width: `calc(${widthPct}% - 2px)`,
                        borderLeft: `3px solid ${teacher?.color ?? "#A56A00"}`,
                        // TAM kart dolgusu — TEK kaynak ATTENDANCE_CALENDAR_COLORS
                        // (bkz. lessonCardFillStyle). Rozet/metin/aria-label AYNEN korunur.
                        ...lessonCardFillStyle(statusVisual),
                      }}
                    >
                      {/* `min-h-0` — flex çocukları varsayılan `min-height:auto` içerikten KÜÇÜK
                          büzülemez; bu, sabit yükseklikli kartta dikey taşmanın gerçek nedeniydi.
                          `overflow-hidden` son satırı gerekirse keser (metin `title`/hover kartıyla
                          hâlâ tam erişilebilir), kutu sınırını asla BOZMAZ. */}
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <LessonCardBody
                          student={student}
                          teacher={teacher}
                          lesson={lesson}
                          branchName={branchNames[lesson.branchId]}
                          tier={tier}
                          statusVisual={statusVisual}
                        />
                        {tier === "full" &&
                        (lesson.studentAttended || lesson.lessonProcessed || lesson.opsMakeupFlag) ? (
                          <LessonOpsBadges
                            studentAttended={lesson.studentAttended}
                            lessonProcessed={lesson.lessonProcessed}
                            opsMakeupFlag={lesson.opsMakeupFlag}
                            studentAbsent={lesson.studentAbsent}
                            studentExcused={lesson.studentExcused}
                          />
                        ) : null}
                      </div>
                      <LessonHoverCard
                        lesson={lesson}
                        student={student}
                        teacher={teacher}
                        room={room}
                        branchName={branchNames[lesson.branchId]}
                      />
                      {editable ? (
                        <div
                          draggable={false}
                          onMouseDown={(e) => startResize(e, lesson)}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize bg-slate-200/0 hover:bg-amber-300/70"
                          aria-label="Süreyi değiştir"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      ) : null}

      {calendarView === "day" ? (
      <div>
        <div className="grid gap-3">
          {visibleDays.map((dayIso) => {
            const day = parseISO(dayIso);
            const today = isSameDay(day, now);
            const dayLessons = visibleWeekLessons
              .filter((l) => isSameDay(parseISO(l.startAt), day))
              .sort((a, b) => a.startAt.localeCompare(b.startAt));
            return (
              <Card
                key={dayIso}
                className={today ? "border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)]/30" : undefined}
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[15px] font-bold text-[var(--color-text)]">{format(day, "EEEE d MMM", { locale: tr })}</p>
                  {today ? <Badge status="scheduled">Bugün</Badge> : null}
                </div>
                {dayLessons.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">Bu gün için planlanmış ders yok.</p>
                ) : (
                  <div className="space-y-2">
                    {dayLessons.map((lesson) => {
                      const student = students.find((s) => s.id === lesson.studentId);
                      const teacher = teachers.find((t) => t.id === lesson.teacherId);
                      const room = rooms.find((r) => r.id === lesson.roomId);
                      const statusVisual = lessonCardStatusVisual(applyOpsOverride(lesson, prunedOverrides[lesson.id]), now);
                      const selected = detailLessonId === lesson.id;
                      return (
                        <button
                          key={lesson.id}
                          type="button"
                          aria-pressed={selected}
                          data-selected={selected ? "true" : undefined}
                          onClick={() => openDetail(lesson)}
                          aria-label={lessonAccessibleLabel(lesson, student, teacher, room, branchNames[lesson.branchId])}
                          className={`relative block w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] p-2.5 text-left text-xs transition-[filter] hover:brightness-110 hover:border-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-focus-ring)] ${selected ? LESSON_SELECTED_CLASS : ""}`}
                          style={{
                            borderLeft: `3px solid ${teacher?.color ?? "#A56A00"}`,
                            // Gün görünümünde de AYNI tam kart dolgusu (haftalık ızgarayla tek kaynak).
                            ...lessonCardFillStyle(statusVisual),
                          }}
                        >
                          <LessonCardBody
                            student={student}
                            teacher={teacher}
                            lesson={lesson}
                            branchName={branchNames[lesson.branchId]}
                            tier="full"
                            statusVisual={statusVisual}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
      ) : null}
      </div>
      </div>
    </div>
  );
}

function DetailPanel({
  lesson,
  canCreate,
  student,
  teacher,
  room,
  branchName,
  now,
  submitting,
  error,
  onClose,
  onEditDone,
  onCancelLesson,
  onCancelSeriesFromLesson,
  onCancelEntireSeries,
  allTeachers,
  allRooms,
  branchNames,
  onOpsStatusChange,
  onOpsPendingChange,
}: {
  lesson: Lesson;
  /** "Tüm kurumlar" görünümünde false — yazma aksiyonları gösterilmez, nedeni yazılır. */
  canCreate: boolean;
  student?: Student;
  teacher?: Teacher;
  room?: Room;
  branchName?: string;
  now: Date;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  /** Revize/silme başarılı — panel kapanır, sayfa bildirimi gösterilir. */
  onEditDone: (message: string) => void;
  onCancelLesson: () => void;
  onCancelSeriesFromLesson: () => void;
  onCancelEntireSeries: () => void;
  /** Faz 13 — öğretmen/şube değiştirme formunun ihtiyaç duyduğu tam listeler. */
  allTeachers: Teacher[];
  allRooms: Room[];
  branchNames: Record<string, string>;
  /** İyimser statü katmanı — kart rengi sunucu turunu beklemez (P0 UAT 2026-09-08). */
  onOpsStatusChange: (lessonId: string, flag: LessonOpsFlagValue) => void;
  onOpsPendingChange: (lessonId: string, pending: boolean) => void;
}) {
  // İptal kuralının TEK kaynağı — sunucu (applyLessonCancel) aynı fonksiyonu çağırır.
  const cancelBlockReason = lessonCancelBlockReason(lesson);
  const isSeriesMember = Boolean(lesson.seriesId);
  const isPastScheduled = lesson.status === "scheduled" && !(parseISO(lesson.startAt) > now);
  const timeRange = `${zonedHm(parseISO(lesson.startAt), DEFAULT_APP_TIMEZONE)}–${zonedHm(parseISO(lesson.endAt), DEFAULT_APP_TIMEZONE)}`;

  return (
    <Card className="border-[var(--color-border-strong)] shadow-[var(--shadow-md)]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Seçili ders</p>
          <h3 className="truncate text-base font-bold text-[var(--color-text)]" title={student?.name}>
            {student?.name ?? "Öğrenci bilinmiyor"}
          </h3>
          <p className="text-sm font-medium text-[var(--color-text)]">
            {format(toWallClockDate(lesson.startAt), "d MMMM yyyy, EEEE", { locale: tr })} · {timeRange}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {[lesson.instrument, teacher?.name, room?.name, branchName].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <LessonStatusBadge status={resolveLessonFinalStatus(lesson, now)} />
            {lesson.type === "makeup" ? <Badge status="makeup">Telafi dersi</Badge> : null}
            {isSeriesMember ? <Badge status="scheduled">Tekrarlayan seri</Badge> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
          aria-label="Seçili ders panelini kapat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 2026-09-19 — en sık kullanılan işlem en üstte: "Yoklama durumu". */}
      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5" aria-label="Yoklama durumu">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Yoklama durumu</p>
        {canCreate ? (
          <LessonOpsActions
            lessonId={lesson.id}
            studentAttended={lesson.studentAttended}
            lessonProcessed={lesson.lessonProcessed}
            opsMakeupFlag={lesson.opsMakeupFlag}
            studentAbsent={lesson.studentAbsent}
            studentExcused={lesson.studentExcused}
            onStatusChange={onOpsStatusChange}
            onPendingChange={onOpsPendingChange}
          />
        ) : (
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Yoklama girmek için üstteki kurum seçiciden bu dersin kurumunu seçin.
          </p>
        )}
      </section>

      {canCreate ? (
        <section className="mt-3" aria-label="Ders işlemleri">
          <div className="flex flex-wrap items-start gap-2">
            {cancelBlockReason === null ? (
              <Button variant="danger" onClick={onCancelLesson} disabled={submitting}>
                {isSeriesMember ? "Sadece bu dersi iptal et" : "Bu dersi iptal et"}
              </Button>
            ) : null}
            <LessonReassignmentModal lesson={lesson} teachers={allTeachers} rooms={allRooms} branchNames={branchNames} />
          </div>
          {cancelBlockReason !== null && lesson.status !== "cancelled" ? (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              <strong>İptal edilemez:</strong> {cancelBlockReason}
            </p>
          ) : null}
          {isSeriesMember ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-2">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Seri:</span>
              <Button variant="secondary" className="!py-1 text-xs" onClick={onCancelSeriesFromLesson} disabled={submitting}>
                Bu ders ve sonrasını iptal et
              </Button>
              <Button variant="secondary" className="!py-1 text-xs" onClick={onCancelEntireSeries} disabled={submitting}>
                Tüm seriyi iptal et
              </Button>
              <span className="basis-full text-[11px] text-[var(--color-text-muted)]">
                Seri iptalinde İşlendi/Telafi işaretli ve geçmiş dersler korunur, yalnız planlı dersler iptal olur.
              </span>
            </div>
          ) : null}
          {isPastScheduled ? (
            <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
              Geçmiş ders takvimde sürüklenemez; tarih/saat için aşağıdaki &quot;Dersi düzenle / sil&quot; bölümünü kullanın.
            </p>
          ) : null}

          <LessonScopeEditor key={lesson.id} lesson={lesson} onDone={onEditDone} />
        </section>
      ) : (
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">
          İptal, öğretmen/şube değişikliği ve düzenleme için üstteki kurum seçiciden tek bir kurum seçin.
        </p>
      )}

      {error ? (
        <p className="mt-3 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

function CommunicationDraftCard({ label, msg }: { label: string; msg: LessonCommunicationMessage }) {
  const [markedSent, setMarkedSent] = useState(false);
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--color-text)] dark:text-slate-50">
        {msg.toName}
        {msg.toPhone ? ` · ${msg.toPhone}` : ""}
      </p>
      <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--color-surface-muted)] p-2 text-[11px] leading-relaxed text-[var(--color-text-muted)] dark:text-slate-300">
        {msg.body}
      </pre>
      {msg.waLink ? (
        <a href={msg.waLink} target="_blank" rel="noreferrer">
          <Button className="mt-2 bg-emerald-600 !py-1.5 text-xs hover:bg-emerald-700">
            <ExternalLink className="h-3.5 w-3.5" />
            WhatsApp&apos;ta aç
          </Button>
        </a>
      ) : (
        <p className="mt-2 text-xs text-rose-600">{msg.missingPhoneReason ?? "Telefon numarası eksik."}</p>
      )}
      <label className="mt-2 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
        <input type="checkbox" checked={markedSent} onChange={(e) => setMarkedSent(e.target.checked)} />
        Sistemde gönderildi olarak işaretle
      </label>
      {markedSent ? (
        <p className="mt-1 text-[10px] text-amber-600">
          Bu yalnızca bilgi amaçlıdır — WhatsApp üzerinden gerçekten gönderildiğinin kanıtı değildir.
        </p>
      ) : null}
    </div>
  );
}
