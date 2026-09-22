/**
 * Kurum sahibi (SUPER_ADMIN) personel performans analizi — saf hesaplama.
 *
 * Öğretmen performansından (teacher-performance / v2) BİLİNÇLİ olarak ayrıdır:
 * personel metrikleri iş-takip görevleri, tahsilat (receivedByUserId) ve
 * (atıfedilebilirse) yeni öğrenci kaydı üzerinedir; yoklama/geri bildirim/
 * ödev bileşenleri YOKTUR.
 *
 * I/O yok — çağıran taraf (getStaffPerformanceTool) AppData + Task listesini
 * tenant-scoped olarak verir. assigneeId İş Takip'te User.id (admin) veya
 * Teacher.id'dir; personel için eşleşme StaffMember.portalUserId üzerinden.
 */

import type { AppData, BranchId, Payment, StaffMember, Student, Task } from "./types";
import { defaultWeightsFor, weightedScore } from "./performance-weights";

export type StaffPerformancePeriod = {
  /** yyyy-MM */
  yearMonth: string;
  /** Dahil — ayın 1'i */
  startYmd: string;
  /** Dahil — ayın son günü */
  endYmd: string;
};

export type StaffPerformanceBranchRow = {
  branchId: BranchId | null;
  tasksCompleted: number;
  paymentsCollectedCount: number;
  paymentsCollectedAmount: number;
};

export type StaffPerformanceMetrics = {
  period: StaffPerformancePeriod;
  /** Dönemde sorumlu olduğu aday görevler (dueDate dönem içinde VEYA dueDate yoksa createdAt dönem içinde). */
  tasksAssigned: number;
  /** Adaylar içinde status=COMPLETED olanlar. */
  tasksCompleted: number;
  /** completedAt (gün) <= dueDate (gün); dueDate'i olan tamamlananlar. */
  tasksOnTime: number;
  /** completedAt (gün) < dueDate (gün) — onTime alt kümesi. */
  tasksEarly: number;
  /** completedAt (gün) > dueDate (gün). */
  tasksLate: number;
  /** completed / assigned; payda 0 ise null. */
  taskCompletionRate: number | null;
  /** onTime / (onTime+late) yani dueDate'li tamamlananlar; payda 0 ise null. */
  onTimeRate: number | null;
  /**
   * Öğrenci kaydında createdBy yok — personele atıf yapılamaz.
   * `attributable: false` iken count kurum geneli yeni kayıttır (bağlam);
   * true olsaydı personele yazılırdı.
   */
  newStudentRegistrations: {
    attributable: boolean;
    count: number;
    label: string;
  };
  paymentsCollectedCount: number;
  paymentsCollectedAmount: number;
  /** Bu personelin dönem içinde planladığı ders (Lesson.createdByUserId). */
  lessonsPlanned: number;
  branchBreakdown: StaffPerformanceBranchRow[];
};

export type StaffPerformanceReport = {
  staffId: string;
  staffName: string;
  position: string;
  portalUserId: string | null;
  /** Görev/tahsilat atfı için portal kullanıcısı gerekli. */
  linkageNote: string | null;
  current: StaffPerformanceMetrics;
  previous: StaffPerformanceMetrics;
  /** Kurum sahibinin ağırlıklarıyla 0–100 puan; hiç veri yoksa null. */
  score: { current: number | null; previous: number | null };
};

/**
 * Ağırlıklı personel puanı. Oranlar doğrudan %, sayılar hedefe oranlanır.
 * ponytail: sabit hedefler (10 tahsilat, 4 kayıt, 20 ders = 100); kurum bazlı hedef gerekirse ayara taşı.
 */
export function computeStaffPerformanceScore(
  metrics: StaffPerformanceMetrics,
  weights: Record<string, number>
): number | null {
  const scaled = (n: number, target: number) => (n > 0 ? Math.min(100, (n / target) * 100) : 0);
  return weightedScore([
    { key: "tasks", weightPercent: weights.tasks ?? 0, normalized: metrics.taskCompletionRate === null ? null : metrics.taskCompletionRate * 100 },
    { key: "onTime", weightPercent: weights.onTime ?? 0, normalized: metrics.onTimeRate === null ? null : metrics.onTimeRate * 100 },
    { key: "collections", weightPercent: weights.collections ?? 0, normalized: scaled(metrics.paymentsCollectedCount, 10) },
    {
      key: "newStudents",
      weightPercent: weights.newStudents ?? 0,
      normalized: metrics.newStudentRegistrations.attributable ? scaled(metrics.newStudentRegistrations.count, 4) : null,
    },
    { key: "lessonsPlanned", weightPercent: weights.lessonsPlanned ?? 0, normalized: scaled(metrics.lessonsPlanned, 20) },
  ]).score;
}

function inYmdRange(ymd: string, startYmd: string, endYmd: string): boolean {
  return ymd >= startYmd && ymd <= endYmd;
}

function ymdOf(isoOrYmd: string): string {
  return isoOrYmd.slice(0, 10);
}

/** Ayın gün sayısı (1-based month). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function periodFromYearMonth(yearMonth: string): StaffPerformancePeriod {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) throw new Error(`Geçersiz yearMonth: ${yearMonth}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Geçersiz yearMonth: ${yearMonth}`);
  const endDay = daysInMonth(year, month);
  return {
    yearMonth,
    startYmd: `${yearMonth}-01`,
    endYmd: `${yearMonth}-${String(endDay).padStart(2, "0")}`,
  };
}

/** Bugünün yyyy-MM-dd'sinden içinde bulunulan ay. */
export function currentYearMonth(todayYmd: string): string {
  return todayYmd.slice(0, 7);
}

export function previousYearMonth(yearMonth: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) throw new Error(`Geçersiz yearMonth: ${yearMonth}`);
  let year = Number(m[1]);
  let month = Number(m[2]) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Oran: 0–1 arası, 1 ondalık hassasiyet (yüzdeye çevirirken *100). Payda 0 → null. */
function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function isAssignedToStaff(task: Task, assigneeIds: Set<string>): boolean {
  return !!task.assigneeId && assigneeIds.has(task.assigneeId);
}

/**
 * Dönem adayı: dueDate dönem içindeyse dahil; dueDate yoksa createdAt dönem içindeyse dahil.
 * (teacher-performance-v2 iş-takip bileşeniyle aynı dönem kapsamı.)
 */
function isTaskCandidateForPeriod(task: Task, period: StaffPerformancePeriod): boolean {
  if (task.dueDate) return inYmdRange(ymdOf(task.dueDate), period.startYmd, period.endYmd);
  return inYmdRange(ymdOf(task.createdAt), period.startYmd, period.endYmd);
}

function collectedAmount(p: Payment): number {
  if (typeof p.paidAmount === "number" && p.paidAmount > 0) return p.paidAmount;
  return p.amount;
}

function isCollectedInPeriod(p: Payment, period: StaffPerformancePeriod, userId: string): boolean {
  if (p.receivedByUserId !== userId) return false;
  if (p.status !== "paid" && p.status !== "partial") return false;
  if (!p.paidAt) return false;
  return inYmdRange(ymdOf(p.paidAt), period.startYmd, period.endYmd);
}

function newStudentsInPeriod(students: Student[], period: StaffPerformancePeriod): number {
  return students.filter((s) => {
    const enroll = s.enrollmentStartDate ? ymdOf(s.enrollmentStartDate) : ymdOf(s.createdAt);
    return inYmdRange(enroll, period.startYmd, period.endYmd);
  }).length;
}

function emptyBranchRow(branchId: BranchId | null): StaffPerformanceBranchRow {
  return { branchId, tasksCompleted: 0, paymentsCollectedCount: 0, paymentsCollectedAmount: 0 };
}

export function computeStaffPerformanceMetrics(input: {
  period: StaffPerformancePeriod;
  staff: Pick<StaffMember, "id" | "branchId" | "portalUserId">;
  tasks: Task[];
  payments: Payment[];
  students: Student[];
  lessons?: { createdByUserId?: string; startAt: string }[];
  /** portalUserId yoksa görev/tahsilat 0; öğrenci kurum geneli bağlam olarak kalır. */
  assigneeIds: Set<string>;
  collectorUserId: string | null;
}): StaffPerformanceMetrics {
  const { period, tasks, payments, students, assigneeIds, collectorUserId } = input;
  const lessons = input.lessons ?? [];

  const candidates = tasks.filter((t) => isAssignedToStaff(t, assigneeIds) && isTaskCandidateForPeriod(t, period));
  const completed = candidates.filter((t) => t.status === "COMPLETED");

  let tasksOnTime = 0;
  let tasksEarly = 0;
  let tasksLate = 0;
  for (const t of completed) {
    if (!t.dueDate || !t.completedAt) continue;
    const due = ymdOf(t.dueDate);
    const done = ymdOf(t.completedAt);
    if (done < due) {
      tasksEarly += 1;
      tasksOnTime += 1;
    } else if (done === due) {
      tasksOnTime += 1;
    } else {
      tasksLate += 1;
    }
  }

  const withDueCompleted = tasksOnTime + tasksLate;

  const branchMap = new Map<string | null, StaffPerformanceBranchRow>();
  const bumpBranch = (branchId: BranchId | null | undefined) => {
    const key = branchId ?? null;
    let row = branchMap.get(key);
    if (!row) {
      row = emptyBranchRow(key);
      branchMap.set(key, row);
    }
    return row;
  };

  for (const t of completed) {
    bumpBranch(t.branchId ?? input.staff.branchId).tasksCompleted += 1;
  }

  let paymentsCollectedCount = 0;
  let paymentsCollectedAmount = 0;
  if (collectorUserId) {
    for (const p of payments) {
      if (!isCollectedInPeriod(p, period, collectorUserId)) continue;
      paymentsCollectedCount += 1;
      const amt = collectedAmount(p);
      paymentsCollectedAmount += amt;
      const student = students.find((s) => s.id === p.studentId);
      const row = bumpBranch(student?.branchId ?? input.staff.branchId);
      row.paymentsCollectedCount += 1;
      row.paymentsCollectedAmount += amt;
    }
  }

  // Oluşturan kullanıcı alanı dolu kayıt varsa personele yazılır; eski veride kurum geneli bağlam.
  const attributable = Boolean(collectorUserId) && students.some((s) => s.createdByUserId);
  const attributedNew = attributable
    ? students.filter((s) => {
        if (s.createdByUserId !== collectorUserId) return false;
        const enroll = s.enrollmentStartDate ? ymdOf(s.enrollmentStartDate) : ymdOf(s.createdAt);
        return inYmdRange(enroll, period.startYmd, period.endYmd);
      }).length
    : 0;
  const institutionNew = newStudentsInPeriod(students, period);
  const lessonsPlanned = collectorUserId
    ? lessons.filter((l) => l.createdByUserId === collectorUserId && inYmdRange(ymdOf(l.startAt), period.startYmd, period.endYmd)).length
    : 0;

  return {
    period,
    tasksAssigned: candidates.length,
    tasksCompleted: completed.length,
    tasksOnTime,
    tasksEarly,
    tasksLate,
    taskCompletionRate: rate(completed.length, candidates.length),
    onTimeRate: rate(tasksOnTime, withDueCompleted),
    newStudentRegistrations: {
      attributable,
      count: attributable ? attributedNew : institutionNew,
      label: attributable
        ? "Bu personelin açtığı yeni öğrenci kayıtları."
        : "Kayıtta oluşturan kullanıcı yok; sayı kurum geneli yeni kayıttır (bu personele yazılmaz).",
    },
    paymentsCollectedCount,
    paymentsCollectedAmount,
    lessonsPlanned,
    branchBreakdown: Array.from(branchMap.values()).sort((a, b) => {
      const aKey = a.branchId ?? "";
      const bKey = b.branchId ?? "";
      return b.tasksCompleted + b.paymentsCollectedCount - (a.tasksCompleted + a.paymentsCollectedCount) || aKey.localeCompare(bKey);
    }),
  };
}

/**
 * Tek personel için bu ay + önceki ay raporu.
 * `assigneeIds`: portalUserId (ve varsa defensive staff.id) — boşsa görev/tahsilat 0.
 */
export function computeStaffPerformanceReport(input: {
  staff: StaffMember;
  tasks: Task[];
  data: Pick<AppData, "payments" | "students"> & { lessons?: AppData["lessons"] };
  /** Raporun "şu anki ay"ı — varsayılan çağıranda todayYmd'den üretilir. */
  yearMonth: string;
  /** Kurum ağırlıkları; verilmezse ürün varsayılanı. */
  weights?: Record<string, number>;
}): StaffPerformanceReport {
  const { staff, tasks, data, yearMonth } = input;
  const weights = input.weights ?? defaultWeightsFor("staff");
  const assigneeIds = new Set<string>();
  if (staff.portalUserId) assigneeIds.add(staff.portalUserId);
  // Defensive: nadiren StaffMember.id ile atanmış görev kalırsa kaçmasın.
  assigneeIds.add(staff.id);

  const collectorUserId = staff.portalUserId ?? null;
  const linkageNote = staff.portalUserId
    ? null
    : "Bu personele portal kullanıcısı bağlı değil. Görev ataması ve tahsilat User.id üzerinden yazıldığı için görev/tahsilat metrikleri 0 görünür; önce portal erişimi bağlayın.";

  const currentPeriod = periodFromYearMonth(yearMonth);
  const previousPeriod = periodFromYearMonth(previousYearMonth(yearMonth));

  const base = {
    staff: { id: staff.id, branchId: staff.branchId, portalUserId: staff.portalUserId },
    tasks,
    payments: data.payments,
    students: data.students,
    lessons: data.lessons ?? [],
    assigneeIds,
    collectorUserId,
  };

  const current = computeStaffPerformanceMetrics({ ...base, period: currentPeriod });
  const previous = computeStaffPerformanceMetrics({ ...base, period: previousPeriod });

  return {
    staffId: staff.id,
    staffName: staff.name,
    position: staff.position,
    portalUserId: staff.portalUserId ?? null,
    linkageNote,
    current,
    previous,
    score: {
      current: computeStaffPerformanceScore(current, weights),
      previous: computeStaffPerformanceScore(previous, weights),
    },
  };
}
