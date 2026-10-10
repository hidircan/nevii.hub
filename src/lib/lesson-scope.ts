/**
 * P0 mutasyon performansı (2026-09-07) — TEK DERS mutasyonu için gereken en
 * küçük `AppData` dilimi.
 *
 * Kanıtlanmış sorun (bkz. docs/performance/ADMIN_WEB_P0_BASELINE.md): ders
 * taşıma bir mutasyonda tenant'ın TÜM `AppData`'sını ÜÇ kez okuyordu (ölçüm:
 * 64 DB gidiş-dönüşünün 42'si), statü değiştirme yine üç kez (46'nın 42'si).
 *
 * Çözüm, saf iş kurallarını (`applyLessonScheduleUpdate`, `applyLessonOpsFlag`,
 * `getStudentMakeupQuota`) YENİDEN YAZMAK yerine onlara aynı `AppData`
 * SÖZLEŞMESİNİ, ama yalnız ilgili satırlarla doldurulmuş olarak vermektir.
 * Bu dosya o dilimin TEK tanımıdır:
 *
 * - `settings`            : tam (şubeler dahil — telafi/politika metinleri için); YALNIZ
 *                           `logoUrl` boş (~79 KB data-URI; bu yollarda okunmuyor — db egress)
 * - `teachers`            : yalnız dersin öğretmeni      (validateLessonSlot)
 * - `rooms`               : yalnız dersin odası           (validateLessonSlot)
 * - `students`            : yalnız dersin öğrencisi       (termType, kota)
 * - `lessons`             : dersin kendisi ∪ öğrencinin TÜM dersleri ∪ aynı
 *                           öğretmen/odanın hedef gün(ler) penceresindeki
 *                           dersleri (çakışma + günlük limit + telafi kotasının
 *                           `periodKeyForLesson` çözümlemesi için)
 * - `attendances`         : yalnız bu dersin yoklamaları
 * - `makeupRequests`      : yalnız bu öğrencinin telafi talepleri (kota)
 * - `payments`            : yalnız bu derse bağlı tahsilatlar
 * - diğer koleksiyonlar   : BOŞ — bu iki mutasyon yolunda hiç okunmuyor
 *
 * `store-db` bu dilimi filtrelenmiş Prisma `include`'larıyla ÜRETİR;
 * `store-json`/`store-memory` ise tam veriyi bu fonksiyonla DARALTIR — böylece
 * üç mod da AYNI dilimi görür ve testler (json modunda çalışır) dilim
 * yetersiz kalırsa bunu YAKALAR. Dilimi genişletmek gerekirse burayı ve
 * `store-db.readLessonScope`'u BİRLİKTE güncelleyin.
 */
import { addDays, endOfDay, startOfDay, subDays } from "date-fns";
import type { AppData, Lesson } from "./types";

/** Çakışma penceresi: hedef günün ±1 günü (gece yarısını aşan dersler için pay). */
function dayWindow(date: Date): { from: number; to: number } {
  return { from: subDays(startOfDay(date), 1).getTime(), to: addDays(endOfDay(date), 1).getTime() };
}

/** Dar dilimin `lessons` alanına girmesi gereken günler (dersin kendi günü + varsa hedef gün). */
export function lessonScopeDays(lesson: Pick<Lesson, "startAt">, targetStartAt?: string): Date[] {
  const days = [new Date(lesson.startAt)];
  if (targetStartAt) {
    const target = new Date(targetStartAt);
    if (!Number.isNaN(target.getTime())) days.push(target);
  }
  return days;
}

/** Bir dersin `lessons` dilimine girip girmediği — db ve json/memory için TEK kural. */
export function isLessonInScope(
  candidate: Pick<Lesson, "id" | "studentId" | "teacherId" | "roomId" | "startAt">,
  target: Pick<Lesson, "id" | "studentId" | "teacherId" | "roomId" | "startAt">,
  days: Date[]
): boolean {
  if (candidate.id === target.id) return true;
  if (candidate.studentId === target.studentId) return true;
  if (candidate.teacherId !== target.teacherId && candidate.roomId !== target.roomId) return false;
  const at = new Date(candidate.startAt).getTime();
  return days.some((d) => {
    const w = dayWindow(d);
    return at >= w.from && at <= w.to;
  });
}

/**
 * Tam `AppData`'yı tek ders mutasyonu için gereken dilime daraltır.
 * Ders bulunamazsa `null` döner.
 */
export function narrowLessonScope(
  data: AppData,
  lessonId: string,
  targetStartAt?: string
): AppData | null {
  const lesson = data.lessons.find((l) => l.id === lessonId);
  if (!lesson) return null;
  const days = lessonScopeDays(lesson, targetStartAt);
  return {
    settings: { ...data.settings, logoUrl: "" },
    closedDayOverrides: data.closedDayOverrides,
    teachers: data.teachers.filter((t) => t.id === lesson.teacherId),
    students: data.students.filter((s) => s.id === lesson.studentId),
    rooms: data.rooms.filter((r) => r.id === lesson.roomId),
    lessons: data.lessons.filter((l) => isLessonInScope(l, lesson, days)),
    lessonSeries: [],
    attendances: data.attendances.filter((a) => a.lessonId === lessonId),
    makeupRequests: data.makeupRequests.filter((m) => m.studentId === lesson.studentId),
    payments: data.payments.filter((p) => p.lessonId === lessonId),
    teacherFeeRules: [],
    teacherPayouts: [],
    packages: [],
    discountCampaigns: [],
  };
}

/** Yeni ders (henüz satırı yok) — dilimin anahtarı ders kimliği yerine öğretmen/oda/öğrenci + başlangıç. */
export type SlotScopeTarget = Pick<Lesson, "studentId" | "teacherId" | "roomId" | "startAt">;

/**
 * DB egress (2026-10-10) — YENİ ders doğrulaması (`addLesson` → `validateLessonSlot`) için aynı dilim:
 * öğretmen/oda/öğrenci + öğrencinin TÜM dersleri + öğretmen/odanın hedef gün penceresi + öğrencinin
 * telafi talepleri. Yoklama/ödeme yok (henüz ders yok). `store-db` aynı kapsamı Prisma ile üretir;
 * json/memory doğrulamayı bu dar girdiyle çalıştırır (dilim yetersizse json testleri yakalar).
 */
export function narrowSlotScope(data: AppData, target: SlotScopeTarget): AppData {
  const days = lessonScopeDays(target);
  const probe = { ...target, id: "" };
  return {
    settings: { ...data.settings, logoUrl: "" },
    closedDayOverrides: data.closedDayOverrides,
    teachers: data.teachers.filter((t) => t.id === target.teacherId),
    students: data.students.filter((s) => s.id === target.studentId),
    rooms: data.rooms.filter((r) => r.id === target.roomId),
    lessons: data.lessons.filter((l) => isLessonInScope(l, probe, days)),
    lessonSeries: [],
    attendances: [],
    makeupRequests: data.makeupRequests.filter((m) => m.studentId === target.studentId),
    payments: [],
    teacherFeeRules: [],
    teacherPayouts: [],
    packages: [],
    discountCampaigns: [],
  };
}

/**
 * Dar dilim üzerinde çalışan bir saf fonksiyonun sonucunu TAM veriye geri
 * yazar. `json`/`memory` store'ları tüm veriyi tek dosyada tuttuğu için,
 * dilimle çalışıp sonucu bütüne birleştirmeleri gerekir — böylece üç mod da
 * saf kuralları AYNI (dar) girdiyle çalıştırır ve dilim yetersiz kalırsa
 * bunu json modunda koşan testler yakalar.
 *
 * Yalnız dilimin KAPSADIĞI koleksiyonlar değiştirilir; dilim dışındaki
 * satırlara dokunulmaz.
 */
export function mergeLessonScope(full: AppData, scope: AppData, lessonId: string): AppData {
  const studentId = scope.lessons.find((l) => l.id === lessonId)?.studentId;
  const scopedLessonIds = new Set(scope.lessons.map((l) => l.id));
  return {
    ...full,
    lessons: [
      ...full.lessons.filter((l) => !scopedLessonIds.has(l.id)),
      ...scope.lessons,
    ],
    attendances: [
      ...full.attendances.filter((a) => a.lessonId !== lessonId),
      ...scope.attendances,
    ],
    makeupRequests:
      studentId === undefined
        ? full.makeupRequests
        : [
            ...full.makeupRequests.filter((m) => m.studentId !== studentId),
            ...scope.makeupRequests,
          ],
    payments: [...full.payments.filter((p) => p.lessonId !== lessonId), ...scope.payments],
  };
}
