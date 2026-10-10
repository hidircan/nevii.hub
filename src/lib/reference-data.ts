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
import type { AppData, Payment } from "./types";
import type { DashboardPaymentRow } from "./dashboard/daily-summary";

export type ReferenceData = Pick<AppData, "settings" | "teachers" | "students" | "rooms" | "teacherFeeRules"> & {
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
 * ÖĞRENCİ LİSTESİ dilimi: referans veri + TÜM ödeme satırlarının yalnız durum rozeti ve açık
 * borç tutarı için gereken beş alanı (satır sayısı aynı, dar). Tarih/açıklama YOK.
 */
export type PaymentStatusRow = Pick<Payment, "studentId" | "status" | "contractId" | "amount" | "paidAmount">;
export type StudentListData = ReferenceData & { payments: PaymentStatusRow[] };

/** 2026-10-04 — listede açık/gecikmiş borç TUTARI da gösterilir (tek kaynak `summarizeStudentDebt`): tutar alanları eklendi. */
export function toPaymentStatusRow(p: PaymentStatusRow): PaymentStatusRow {
  return { studentId: p.studentId, status: p.status, contractId: p.contractId, amount: p.amount, paidAmount: p.paidAmount };
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

export function toReferenceData(data: AppData): ReferenceData {
  return {
    settings: { ...data.settings, logoUrl: "" },
    teachers: data.teachers,
    students: data.students,
    rooms: data.rooms,
    teacherFeeRules: data.teacherFeeRules,
    packages: data.packages ?? [],
    discountCampaigns: data.discountCampaigns ?? [],
    teacherPayoutPolicies: data.teacherPayoutPolicies ?? [],
    closedDayOverrides: data.closedDayOverrides ?? [],
  };
}
