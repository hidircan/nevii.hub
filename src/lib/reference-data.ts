/**
 * DB egress (2026-09-30) — "referans veri" dilimi: kurum ayarları + öğretmen/öğrenci/oda/
 * paket/kampanya/ücret kuralı/hakediş politikası/çalışma günü istisnaları. Ders, seri,
 * yoklama, telafi, ödeme ve kayıtlı hakediş satırları YOKTUR.
 *
 * Neden: test DB ölçümünde (pg_stat_statements, 25 gün) Database egress'in büyük kısmı
 * `readData()`'nın tam hidrasyonuydu (Payment ~3.5 GB, Lesson ~3.1 GB). Bu koleksiyonları
 * hiç göstermeyen panel sayfaları da her açılışta hepsini okuyordu.
 *
 * Güvenlik ağı TİPTİR: `ReferenceData`'da ağır koleksiyonlar yoktur, bu yüzden onları okuyan
 * bir sayfa/fonksiyon (ör. `AppData` bekleyen bir yardımcı) DERLENMEZ — "ders yok / 0 TL"
 * gibi sessiz eksik veri yerine derleme hatası alınır. `settings.logoUrl` BOŞ gelir
 * (~79 KB data-URI); logoyu gösteren ekranlar (Kurulum, e-posta, sözleşme) tam okumayı kullanır.
 *
 * `store-db` bu dilimi filtreli Prisma sorgusuyla ÜRETİR; json/memory tam veriden bu
 * fonksiyonla TÜRETİR — üç mod aynı şekli görür.
 */
import type { AppData, Payment, StudentRef } from "./types";
import { REFERENCE_STUDENT_OMIT } from "./types";
import type { DashboardPaymentRow } from "./dashboard/daily-summary";

export type ReferenceData = Pick<AppData, "settings" | "teachers" | "rooms" | "teacherFeeRules"> & {
  students: StudentRef[];
  packages: NonNullable<AppData["packages"]>;
  discountCampaigns: NonNullable<AppData["discountCampaigns"]>;
  teacherPayoutPolicies: NonNullable<AppData["teacherPayoutPolicies"]>;
  closedDayOverrides: NonNullable<AppData["closedDayOverrides"]>;
};

/**
 * TEK ÖĞRENCİ dilimi: referans veri + YALNIZ o öğrencinin ders/seri/yoklama/telafi/ödeme
 * satırları; `students` yalnız o öğrenci. Öğrenci detay sekmeleri ve Yoklama Takvimi
 * (dönem/ay) bunu okur — bu ekranlardaki her ağır erişim zaten `studentId` ile süzülüyor.
 * Telafi/ödeme/yoklama satırının öğrencisi kaynak dersinkiyle aynıdır (üç oluşturma yolu da
 * `lesson.studentId` yazar; test DB'de 0 uyumsuzluk, 2026-09-30).
 *
 * `teacherPayouts` YOK → tip `AppData`'ya atanamaz: tam veri bekleyen bir fonksiyona
 * yanlışlıkla verilirse derleme kırılır. Diğer öğrencilerin satırlarına bakan kod
 * (ör. öğretmenin tüm dersleri) bu dilimle YAZILMAMALI — onun için tam okuma kullanın.
 */
export type StudentScopeData = Omit<ReferenceData, "students"> &
  Pick<AppData, "students" | "lessons" | "lessonSeries" | "attendances" | "makeupRequests" | "payments">;

export function narrowToStudentScope(data: AppData, studentId: string): StudentScopeData {
  return {
    ...toReferenceData(data),
    students: data.students.filter((s) => s.id === studentId),
    lessons: data.lessons.filter((l) => l.studentId === studentId),
    lessonSeries: data.lessonSeries.filter((s) => s.studentId === studentId),
    attendances: data.attendances.filter((a) => a.studentId === studentId),
    makeupRequests: data.makeupRequests.filter((m) => m.studentId === studentId),
    payments: data.payments.filter((p) => p.studentId === studentId),
  };
}

/**
 * DERS PENCERESİ dilimi: referans veri + `startAt`'i [from, to] aralığındaki TÜM dersler
 * (Ders Programı haftası). Çağıran kendi kesin filtresini uygular; pencereyi o filtreden
 * GENİŞ verir (sınır/saat dilimi farkıyla ders kaybolmasın).
 */
export type LessonWindowData = ReferenceData & Pick<AppData, "lessons">;

export function narrowToLessonWindow(data: AppData, from: Date, to: Date): LessonWindowData {
  const lo = from.getTime();
  const hi = to.getTime();
  return {
    ...toReferenceData(data),
    lessons: data.lessons.filter((l) => {
      const t = new Date(l.startAt).getTime();
      return t >= lo && t <= hi;
    }),
  };
}

/**
 * TELAFİ MERKEZİ dilimi (2026-10-16): referans veri + TÜM dersler + TÜM telafi talepleri. Öneri doğrulama
 * (`validateLessonSlot`), dönem hakkı (`getStudentMakeupQuota`) ve aşama türetmesi yalnız bunlara bakar;
 * ödeme/yoklama/seri/hakediş satırları okunmaz (sayfanın tam okumasının ~yarısı).
 */
export type MakeupCenterData = ReferenceData & Pick<AppData, "lessons" | "makeupRequests">;

/**
 * DB egress (2026-10-18) — `"linked"`: yalnız taleplerin kaynak/onaylı dersleri (mobil telafi listesi yalnız bu
 * derslerin saatini gösterir; sanal süre dolumu da yalnız kaynak derse bakar).
 * `"planning"` (Telafi Merkezi): `"linked"` + telafi dersleri (`makeupRequestId` dolu) + açık taleplerin önerilen
 * saatlerinin ±1 günündeki TÜM dersler. Öneri yeniden doğrulaması (`validateLessonSlot`) yalnız slotla çakışan ve
 * slotla aynı gündeki derslere bakar; dönem hakkı/aşama yalnız kaynak/onaylı derse. Tüm dersler (~5 600 satır,
 * sayfa başı ~1,4 MB) okunmaz. `"all"` (varsayılan) çok kurumlu birleşik görünüm içindir.
 */
export type MakeupCenterOptions = { lessons?: "all" | "linked" | "planning" };

export function makeupLinkedLessonIds(makeupRequests: { sourceLessonId: string; confirmedLessonId?: string | null }[]): string[] {
  return [...new Set(makeupRequests.flatMap((m) => (m.confirmedLessonId ? [m.sourceLessonId, m.confirmedLessonId] : [m.sourceLessonId])))];
}

const PLANNING_OPEN_STATUSES: readonly string[] = ["pending", "suggested", "awaiting_info"];
const DAY_MS = 86_400_000;

/** Açık taleplerin önerilen slotlarını kapsayan [ilk − 1 gün, son + 1 gün] penceresi; slot yoksa null. */
export function makeupPlanningWindow(
  makeupRequests: { status: string; suggestedSlots?: { startAt: string }[] | null }[]
): { from: Date; to: Date } | null {
  const starts = makeupRequests
    .filter((m) => PLANNING_OPEN_STATUSES.includes(m.status))
    .flatMap((m) => (m.suggestedSlots ?? []).map((s) => Date.parse(s.startAt)))
    .filter(Number.isFinite);
  if (starts.length === 0) return null;
  return { from: new Date(Math.min(...starts) - DAY_MS), to: new Date(Math.max(...starts) + DAY_MS) };
}

export function narrowToMakeupCenter(data: AppData, opts?: MakeupCenterOptions): MakeupCenterData {
  const mode = opts?.lessons ?? "all";
  const linked = mode === "all" ? null : new Set(makeupLinkedLessonIds(data.makeupRequests));
  const window = mode === "planning" ? makeupPlanningWindow(data.makeupRequests) : null;
  const inWindow = (startAt: string) => {
    const t = Date.parse(startAt);
    return window !== null && t >= window.from.getTime() && t <= window.to.getTime();
  };
  return {
    ...toReferenceData(data),
    lessons: !linked
      ? data.lessons
      : data.lessons.filter((l) => linked.has(l.id) || (mode === "planning" && (Boolean(l.makeupRequestId) || inWindow(l.startAt)))),
    makeupRequests: data.makeupRequests,
  };
}

/**
 * ÖĞRENCİ LİSTESİ dilimi: referans veri + ödemelerin durum rozeti ve açık/gecikmiş borç tutarı için ÖZETİ
 * (`toPaymentStatusRows`). Tarih/açıklama YOK.
 */
export type PaymentStatusRow = Pick<Payment, "studentId" | "status" | "contractId" | "amount" | "paidAmount">;
export type StudentListData = ReferenceData & { payments: PaymentStatusRow[] };

/** 2026-10-04 — listede açık/gecikmiş borç TUTARI da gösterilir (tek kaynak `summarizeStudentDebt`): tutar alanları eklendi. */
export function toPaymentStatusRow(p: PaymentStatusRow): PaymentStatusRow {
  return { studentId: p.studentId, status: p.status, contractId: p.contractId, amount: p.amount, paidAmount: p.paidAmount };
}

/**
 * DB egress (2026-10-18) — öğrenci listesi ödeme özeti: kalan tutarı olan canlı satırlar (öğrenci, durum, sözleşme)
 * başına TEK satırda toplanır (`amount` = kalanların toplamı, `paidAmount` = 0), ödenmiş satırlar öğrenci başına tek
 * işaret satırıdır. `summarizeStudentDebt`'in `status`/`openTotal`/`overdueTotal` sonucu ham satırlarla AYNIDIR
 * (`openCount` grup sayısıdır — listede yalnız > 0 olup olmadığı kullanılır). Prod'da 1.445 satır → ~200. İdempotenttir;
 * store-db aynı gruplamayı SQL'de yapar, json/memory bunu çağırır.
 */
export function toPaymentStatusRows(payments: readonly PaymentStatusRow[]): PaymentStatusRow[] {
  const groups = new Map<string, PaymentStatusRow>();
  for (const p of payments) {
    if (p.status === "paid") {
      const key = `${p.studentId}|paid`;
      if (!groups.has(key)) groups.set(key, { studentId: p.studentId, status: "paid", contractId: undefined, amount: 0, paidAmount: 0 });
      continue;
    }
    const due = p.amount - p.paidAmount;
    if (p.status === "voided" || due <= 0) continue;
    const key = `${p.studentId}|${p.status}|${p.contractId ?? ""}`;
    const g = groups.get(key);
    if (g) g.amount += due;
    else groups.set(key, { studentId: p.studentId, status: p.status, contractId: p.contractId, amount: due, paidAmount: 0 });
  }
  return [...groups.values()];
}

/**
 * ÖDEMELER dilimi: referans veri + TÜM ödeme satırları (tam alanlar — tutar/toplam hesapları
 * aynen) + YALNIZ ödemelerin `lessonId` ile bağlı olduğu dersler (ekranda ders tarihi etiketi).
 */
export type PaymentsPageData = ReferenceData & Pick<AppData, "payments" | "lessons">;

export function narrowToPaymentsPage(data: AppData): PaymentsPageData {
  const lessonIds = new Set(data.payments.map((p) => p.lessonId).filter((id): id is string => Boolean(id)));
  return { ...toReferenceData(data), payments: data.payments, lessons: data.lessons.filter((l) => lessonIds.has(l.id)) };
}

/**
 * HAKEDİŞ PENCERESİ dilimi: ders penceresi (TÜM öğretmenlerin dersleri) + TÜM kayıtlı hakedişler +
 * hariç tutmalar. Hakediş hesabı (`computeTeacherEarningsForPeriod`, kayıtlı/canlı fark) dersleri
 * dönemin gün anahtarlarıyla kendisi süzer; çağıran pencereyi dönemden ±2 gün GENİŞ verir.
 */
export type PayoutWindowData = LessonWindowData &
  Pick<AppData, "teacherPayouts"> & { teacherPayoutExclusions: NonNullable<AppData["teacherPayoutExclusions"]> };

export function narrowToPayoutWindow(data: AppData, from: Date, to: Date): PayoutWindowData {
  return {
    ...narrowToLessonWindow(data, from, to),
    teacherPayouts: data.teacherPayouts,
    teacherPayoutExclusions: data.teacherPayoutExclusions ?? [],
  };
}

/**
 * PANEL ÖZETİ dilimi: hakediş penceresi (bu ay; bugünün dersleri de içinde) + TÜM ödemelerin
 * özetin okuduğu sekiz alanı + TÜM telafi talepleri + "gelecekte planlı ders var mı" (kurulum
 * ilerlemesi pencere dışına bakar — DB'nin kesin cevabı, aynı kural).
 */
export type DashboardData = PayoutWindowData &
  Pick<AppData, "makeupRequests"> & { payments: DashboardPaymentRow[]; hasFutureScheduledLesson: boolean };

export function toDashboardPaymentRow(p: DashboardPaymentRow): DashboardPaymentRow {
  return {
    id: p.id,
    studentId: p.studentId,
    amount: p.amount,
    paidAmount: p.paidAmount,
    status: p.status,
    dueDate: p.dueDate,
    paidAt: p.paidAt,
    contractId: p.contractId,
  };
}

export function narrowToDashboard(data: AppData, from: Date, to: Date, now: Date): DashboardData {
  return {
    ...narrowToPayoutWindow(data, from, to),
    makeupRequests: data.makeupRequests,
    payments: data.payments.map(toDashboardPaymentRow),
    hasFutureScheduledLesson: data.lessons.some(
      (l) => l.status === "scheduled" && new Date(l.startAt).getTime() > now.getTime()
    ),
  };
}

/** `StudentRef` — tek-öğrenci kolonları SİLİNİR (DB bunları hiç okumaz; json/memory aynı şekli görsün). */
export function toStudentRef(student: StudentRef): StudentRef {
  const ref: Record<string, unknown> = { ...student };
  for (const key of REFERENCE_STUDENT_OMIT) delete ref[key];
  return ref as StudentRef;
}

export function toReferenceData(data: AppData): ReferenceData {
  return {
    settings: { ...data.settings, logoUrl: "" },
    teachers: data.teachers,
    students: data.students.map(toStudentRef),
    rooms: data.rooms,
    teacherFeeRules: data.teacherFeeRules,
    packages: data.packages ?? [],
    discountCampaigns: data.discountCampaigns ?? [],
    teacherPayoutPolicies: data.teacherPayoutPolicies ?? [],
    closedDayOverrides: data.closedDayOverrides ?? [],
  };
}
