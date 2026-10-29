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
import { narrowToStudentScope } from "./reference-data";

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
export function narrowSlotScope(
  data: AppData,
  target: SlotScopeTarget,
  /** Öğretmen/oda pencere günleri — seri doğrulaması tüm oluşum günlerini verir (bkz. `seriesScopeDays`). */
  days: Date[] = lessonScopeDays(target)
): AppData {
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

/** Revize / öğretmen-oda değişimi çakışma penceresi: bu öğretmen/odaların bu günlerdeki (±1 gün) dersleri. */
export type ConflictWindow = { teacherIds: string[]; roomIds: string[]; days: Date[] };

function inConflictWindow(l: Pick<Lesson, "teacherId" | "roomId" | "startAt">, win: ConflictWindow): boolean {
  if (!win.teacherIds.includes(l.teacherId) && !win.roomIds.includes(l.roomId)) return false;
  const at = new Date(l.startAt).getTime();
  return win.days.some((d) => {
    const w = dayWindow(d);
    return at >= w.from && at <= w.to;
  });
}

/**
 * DB egress (2026-10-18) — ders DÜZENLEME dilimi (sil / tamamen sil / revize / öğretmen-şube değişimi / seri iptal):
 * öğrenci dilimi (`narrowToStudentScope`: seri tek öğrencinindir; yoklama/ödeme/telafi bağları öğrencinin satırları,
 * koruma kuralı `lessonProtectionReason` bunlara bakar) + `win` verilirse diğer öğrencilerin o öğretmen/oda/gün
 * dersleri (çakışma). `store-db.readLessonEditScope` aynı kapsamı Prisma ile üretir; json/memory `editOnScope` ile
 * kuralı bu dilimde çalıştırır (dilim yetersizse json testleri yakalar).
 */
export function narrowLessonEditScope(data: AppData, studentId: string, win?: ConflictWindow): AppData {
  const scope = narrowToStudentScope(data, studentId);
  const others = win ? data.lessons.filter((l) => l.studentId !== studentId && inConflictWindow(l, win)) : [];
  return { ...scope, lessons: [...scope.lessons, ...others], teacherPayouts: [] };
}

/** Dilimdeki satırları sonuçla değiştirir (sonuçta olmayan = silindi), dilim dışına dokunmaz; sıra korunur. */
function replaceRows<T extends { id: string }>(all: T[], before: T[], after: T[]): T[] {
  const inBefore = new Set(before.map((r) => r.id));
  const next = new Map(after.map((r) => [r.id, r]));
  const kept = all.flatMap((r) => (!inBefore.has(r.id) ? [r] : next.has(r.id) ? [next.get(r.id)!] : []));
  return [...kept, ...after.filter((r) => !inBefore.has(r.id))];
}

/**
 * json/memory — düzenleme kuralını db ile AYNI dilimde çalıştırır (`windowOf` önce öğrenci diliminden pencereyi
 * hesaplar, db de iki adımda okur) ve başarılı sonucu tam veriye birleştirir (`next`).
 */
export function editOnScope<R extends { ok: boolean; data?: AppData }>(
  full: AppData,
  studentId: string | undefined,
  rule: (scope: AppData) => R,
  windowOf?: (scope: AppData) => ConflictWindow | undefined
): { result: R; next: AppData | null } {
  const base = narrowLessonEditScope(full, studentId ?? "");
  const win = windowOf?.(base);
  const scope = win ? narrowLessonEditScope(full, studentId ?? "", win) : base;
  const result = rule(scope);
  if (!result.ok || !result.data) return { result, next: null };
  const out = result.data;
  return {
    result,
    next: {
      ...full,
      lessons: replaceRows(full.lessons, scope.lessons, out.lessons),
      lessonSeries: replaceRows(full.lessonSeries, scope.lessonSeries, out.lessonSeries),
      attendances: replaceRows(full.attendances, scope.attendances, out.attendances),
      makeupRequests: replaceRows(full.makeupRequests, scope.makeupRequests, out.makeupRequests),
      payments: replaceRows(full.payments, scope.payments, out.payments),
    },
  };
}
