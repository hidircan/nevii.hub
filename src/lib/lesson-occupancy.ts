/**
 * 2026-10-03 (owner) — bir dersin zaman dilimini (öğretmen, oda, öğrenci) GERÇEKTEN doldurup
 * doldurmadığının TEK kuralı. Tüm çakışma kontrolleri (validateLessonSlot ve onu kullanan ders/seri/
 * taşıma/telafi/öneri yolları, öğretmen günlük müsaitlik kartı, db yarış kilidi altındaki yeniden
 * kontrol) ve Ders Programı kartının "saat boş" görünümü bu fonksiyonu kullanır; ikinci bir kopya yazmayın.
 *
 * | Durum                                              | Saati doldurur? | Neden                                    |
 * |----------------------------------------------------|-----------------|------------------------------------------|
 * | Planlandı / Başladı (in_progress)                   | Evet            | ders yapılacak / yapılıyor               |
 * | İşlendi, Geldi, Tamamlandı (completed)              | Evet            | ders o saatte yapıldı (hakediş kaynağı)  |
 * | Gelmedi, Mazeretli, no_show, Kapalı (opsClosedFlag) | Evet            | öğretmen/oda o saatte ayrılmıştı; değişmedi |
 * | Planlanan telafi (type "makeup")                    | Evet            | telafi dersi kendi yeni saatini kullanır |
 * | Telafi (opsMakeupFlag) — ders yapılmamış            | HAYIR           | asıl saatinde yapılmayacak               |
 * | Telafi + İşlendi/Geldi/başladı/tamamlandı (eski çift bayrak) | Evet   | ders fiilen yapılmış; saat boşaltılmaz   |
 * | İptal (status "cancelled")                          | HAYIR           | (önceden de böyleydi)                    |
 *
 * Telafi'ye alınan ders SİLİNMEZ, programda görünmeye devam eder; kaydı, telafi talebi/hakkı, yoklama ve
 * hakediş hesabı aynen kalır — yalnız saati başka bir derse verilebilir. Saati verildikten sonra dersi
 * yeniden saate "oturtan" işlem (Telafi geri alma, başka statüye geçiş, dersi başlatma) çakışırsa
 * engellenir (`reoccupyBlockMessage`).
 */
import type { AppData, Lesson } from "./types";
import { formatDate, formatTime } from "./utils";

export type SlotOccupancyInput = Pick<Lesson, "status" | "opsMakeupFlag" | "lessonProcessed" | "studentAttended">;

export function lessonOccupiesSlot(lesson: SlotOccupancyInput): boolean {
  if (lesson.status === "cancelled") return false;
  if (lesson.lessonProcessed || lesson.studentAttended || lesson.status === "in_progress" || lesson.status === "completed") {
    return true;
  }
  return lesson.opsMakeupFlag !== true;
}

export type SlotResource = "teacher" | "room" | "student";
type SlotLesson = SlotOccupancyInput & Pick<Lesson, "id" | "teacherId" | "roomId" | "studentId" | "startAt" | "endAt"> & { clubSessionId?: string };
export type SlotConflict<L extends SlotLesson = SlotLesson> = { lesson: L; resource: SlotResource };

const RESOURCE_KEY = { teacher: "teacherId", room: "roomId", student: "studentId" } as const;

/**
 * Aday zaman diliminde aynı öğretmen, oda veya öğrenci için saati dolduran ilk ders (öncelik
 * validateLessonSlot ile aynı: öğretmen → oda → öğrenci). Aralıklar yarı açık: bitişik dersler çakışmaz.
 */
export function findSlotConflict<L extends SlotLesson>(
  lessons: readonly L[],
  candidate: Pick<Lesson, "teacherId" | "roomId" | "studentId" | "startAt" | "endAt"> & { id?: string; clubSessionId?: string }
): SlotConflict<L> | null {
  const start = Date.parse(candidate.startAt);
  const end = Date.parse(candidate.endAt);
  for (const resource of ["teacher", "room", "student"] as const) {
    const key = RESOURCE_KEY[resource];
    const hit = lessons.find(
      (l) =>
        l.id !== candidate.id &&
        // 2026-10-06 — aynı kulüp oturumunun satırları (aynı öğretmen/oda, farklı üye) birbirini doldurmaz.
        !(candidate.clubSessionId && l.clubSessionId === candidate.clubSessionId) &&
        l[key] === candidate[key] &&
        lessonOccupiesSlot(l) &&
        Date.parse(l.startAt) < end &&
        start < Date.parse(l.endAt)
    );
    if (hit) return { lesson: hit, resource };
  }
  return null;
}

const RESOURCE_LABEL: Record<SlotResource, string> = { teacher: "öğretmenin", room: "odanın", student: "öğrencinin" };

/** Saat başka derse verildiği için engellenen işlemin Türkçe açıklaması: neden + çakışan ders + çözüm. */
export function slotTakenMessage(
  data: Pick<AppData, "teachers" | "rooms" | "students">,
  lesson: Pick<Lesson, "teacherId" | "roomId" | "studentId" | "startAt" | "endAt">,
  conflict: SlotConflict,
  blockedAction: string
): string {
  const name =
    conflict.resource === "teacher"
      ? data.teachers.find((t) => t.id === lesson.teacherId)?.name
      : conflict.resource === "room"
        ? data.rooms.find((r) => r.id === lesson.roomId)?.name
        : data.students.find((s) => s.id === lesson.studentId)?.name;
  const when = `${formatDate(lesson.startAt, "d MMMM yyyy")} ${formatTime(lesson.startAt)}–${formatTime(lesson.endAt)}`;
  const other = `${formatTime(conflict.lesson.startAt)}–${formatTime(conflict.lesson.endAt)}`;
  return (
    `${blockedAction}: bu dersin saati (${when}) Telafi'ye alındıktan sonra başka bir derse verilmiş — ` +
    `aynı ${RESOURCE_LABEL[conflict.resource]}${name ? ` (${name})` : ""} ${other} arasında dersi var. ` +
    "Önce Ders Programı'nda o dersi başka saate taşıyın veya iptal edin, sonra tekrar deneyin."
  );
}

/**
 * Saati doldurmayan bir ders (Telafi) bu değişiklikle saati yeniden dolduracaksa ve saat bu arada başka
 * bir derse verildiyse Türkçe engel mesajı; aksi hâlde null. `data.lessons` çakışma için taranır.
 */
export function reoccupyBlockMessage(
  data: Pick<AppData, "lessons" | "teachers" | "rooms" | "students">,
  before: SlotLesson,
  after: SlotLesson,
  blockedAction: string
): string | null {
  if (lessonOccupiesSlot(before) || !lessonOccupiesSlot(after)) return null;
  const conflict = findSlotConflict(data.lessons, after);
  return conflict ? slotTakenMessage(data, after, conflict, blockedAction) : null;
}
