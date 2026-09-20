/**
 * C — GÜNLÜK ÖZET (operasyon paneli) hesap katmanı.
 *
 * Neden ayrı bir saf modül: eski `/panel/page.tsx` her şeyi sayfa içinde,
 * satır içi `filter`'larla hesaplıyordu. Bu yüzden (a) test edilemiyordu,
 * (b) şube süzgeci eklemek her bloğa ayrı `if` demekti, (c) aynı sayı
 * (ör. "gecikmiş tahsilat") iki blokta farklı formülle çıkabiliyordu.
 *
 * Burada TEK bir `AppData` + şube süzgecinden TÜM panel türetilir; sayfa
 * yalnızca render eder. Hiçbir I/O yok — `src/lib/__tests__` içinden
 * doğrudan çağrılabilir.
 *
 * TASARIM KARARI (owner talebi): panel "güzel kart dizisi" değil, sabah
 * bakıldığında GÜNÜ ANLATAN bir operasyon ekranıdır. Bu yüzden çıktı iki
 * kategoriye ayrılır:
 *   - `actions`  → bugün birinin bir şey YAPMASI gereken kalemler
 *   - `signals`  → sadece bilgi (bilinmesi gereken, aksiyon gerekmeyen)
 * Ekranda bu ayrım görsel olarak korunur; her şeyi "uyarı" gibi göstermek
 * bir süre sonra hiçbir şeyin uyarı olmaması demektir.
 */

import type { AppData, Lesson, Payment, Student, Task } from "../types";
import { isOutstandingPaymentStatus } from "../utils";
import { resolveLessonFinalStatus } from "../lesson-live-status";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "../timezone";

/** "all" = şube süzgeci yok. */
export type BranchFilter = string | "all";

export type DashboardScope = {
  branchId: BranchFilter;
  /** Kullanıcının bugün gördüğü tarih (kurum saat diliminde, yyyy-MM-dd). */
  today: string;
};

export type ActionTone = "danger" | "warning" | "primary" | "info";

export type DashboardAction = {
  key: string;
  label: string;
  detail: string;
  href: string;
  tone: ActionTone;
  /** Sıralama için: yüksek olan üstte. Gecikmiş para > bugünkü operasyon > bilgi. */
  weight: number;
};

export type TodayLessonRow = {
  id: string;
  startAt: string;
  endAt: string;
  studentName: string;
  teacherName: string;
  teacherColor?: string;
  roomName: string;
  branchShortName: string;
  instrument: string;
  status: string;
  /** Saati geçti ve hâlâ statü girilmemiş — yoklama bekliyor. */
  awaitingAttendance: boolean;
};

export type BranchLoadRow = {
  branchId: string;
  name: string;
  todayLessonCount: number;
  activeStudentCount: number;
  outstandingAmount: number;
  overdueAmount: number;
};

export type DueRow = {
  paymentId: string;
  studentId: string;
  studentName: string;
  branchShortName?: string;
  dueDate: string;
  remaining: number;
  status: Payment["status"];
  /** Bugüne göre gün farkı; negatif = gecikmiş. */
  daysUntilDue: number;
};

export type ContractWatchRow = {
  studentId: string;
  studentName: string;
  branchShortName?: string;
  /** "missing" = hiç sözleşme yok, "expired" = süresi dolmuş, "expiring" = 30 gün içinde bitiyor. */
  state: "missing" | "expired" | "expiring";
  endDate?: string;
};

export type TeacherAttentionRow = {
  teacherId: string;
  teacherName: string;
  reason: string;
};

export type DashboardSummary = {
  scope: DashboardScope;
  actions: DashboardAction[];
  signals: { key: string; label: string; detail: string }[];
  todayLessons: TodayLessonRow[];
  branchLoad: BranchLoadRow[];
  overdue: DueRow[];
  upcomingDue: DueRow[];
  contractWatch: ContractWatchRow[];
  teacherAttention: TeacherAttentionRow[];
  taskSummary: { open: number; overdue: number; dueToday: number };
  money: { collectedThisMonth: number; outstandingTotal: number; overdueTotal: number };
  counts: { activeStudents: number; activeTeachers: number; todayLessons: number; openMakeups: number };
};

/** Gün farkı — takvim günü bazında, saat diliminden bağımsız. */
function dayDiff(fromYmd: string, toYmd: string): number {
  const a = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(5, 7) - 1, +fromYmd.slice(8, 10));
  const b = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

function remainingOf(p: Payment): number {
  return Math.max(p.amount - p.paidAmount, 0);
}

/** Yakında bitecek sözleşme eşiği — Öğrenciler ekranındaki filtreyle AYNI (30 gün). */
export const CONTRACT_EXPIRY_WARNING_DAYS = 30;
/** "Yaklaşan vade" penceresi. */
export const UPCOMING_DUE_DAYS = 14;

export type ContractSummaryInput = {
  studentId: string;
  status: string;
  enrollmentEndDate: string;
};

export function buildDashboardSummary(
  data: AppData,
  scope: DashboardScope,
  /** Öğrenci başına GÜNCEL sözleşme özeti (bkz. contracts.ts listContractSummariesByStudent). */
  contractsByStudent: Map<string, ContractSummaryInput>,
  tasks: Task[] = []
): DashboardSummary {
  const { branchId, today } = scope;
  const inBranch = <T extends { branchId?: string }>(row: T): boolean =>
    branchId === "all" || row.branchId === branchId;

  const branchName = (id?: string) => data.settings.branches.find((b) => b.id === id)?.shortName;

  const students = data.students.filter((s) => inBranch(s));
  const activeStudents = students.filter((s) => s.active !== false);
  const studentById = new Map<string, Student>(data.students.map((s) => [s.id, s]));

  /** Ödeme satırının şubesi ÖĞRENCİDEN gelir — Payment'ta branchId yok. */
  const paymentInScope = (p: Payment) =>
    branchId === "all" || studentById.get(p.studentId)?.branchId === branchId;
  const payments = data.payments.filter(paymentInScope);

  // ---- Bugünün dersleri -------------------------------------------------
  const now = new Date();
  const lessonsToday = data.lessons
    .filter((l) => inBranch(l) && toZonedYmd(new Date(l.startAt), DEFAULT_APP_TIMEZONE) === today)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  const todayLessons: TodayLessonRow[] = lessonsToday.map((l) => {
    const status = resolveLessonFinalStatus(l);
    return {
      id: l.id,
      startAt: l.startAt,
      endAt: l.endAt,
      studentName: studentById.get(l.studentId)?.name ?? "—",
      teacherName: data.teachers.find((t) => t.id === l.teacherId)?.name ?? "—",
      teacherColor: data.teachers.find((t) => t.id === l.teacherId)?.color,
      roomName: data.rooms.find((r) => r.id === l.roomId)?.name ?? "—",
      branchShortName: branchName(l.branchId) ?? "—",
      instrument: l.instrument,
      status,
      awaitingAttendance:
        l.status === "scheduled" && new Date(l.startAt) <= now && status === "planned",
    };
  });

  // ---- Şube yoğunluğu (süzgeç "all" iken anlamlı; tek şubede de doğru) ----
  const branchLoad: BranchLoadRow[] = data.settings.branches
    .filter((b) => branchId === "all" || b.id === branchId)
    .map((b) => {
      const branchStudents = data.students.filter((s) => s.branchId === b.id && s.active !== false);
      const branchStudentIds = new Set(branchStudents.map((s) => s.id));
      const branchPayments = data.payments.filter((p) => branchStudentIds.has(p.studentId));
      return {
        branchId: b.id,
        name: b.shortName || b.name,
        todayLessonCount: lessonsToday.filter((l) => l.branchId === b.id).length,
        activeStudentCount: branchStudents.length,
        outstandingAmount: branchPayments
          .filter((p) => isOutstandingPaymentStatus(p.status))
          .reduce((sum, p) => sum + remainingOf(p), 0),
        overdueAmount: branchPayments
          .filter((p) => p.status === "overdue")
          .reduce((sum, p) => sum + remainingOf(p), 0),
      };
    })
    .sort((a, b) => b.todayLessonCount - a.todayLessonCount);

  // ---- Tahsilat ----------------------------------------------------------
  const outstanding = payments.filter((p) => isOutstandingPaymentStatus(p.status));
  const toDueRow = (p: Payment): DueRow => ({
    paymentId: p.id,
    studentId: p.studentId,
    studentName: studentById.get(p.studentId)?.name ?? "—",
    branchShortName: branchName(studentById.get(p.studentId)?.branchId),
    dueDate: p.dueDate.slice(0, 10),
    remaining: remainingOf(p),
    status: p.status,
    daysUntilDue: dayDiff(today, p.dueDate.slice(0, 10)),
  });

  const overdue = outstanding
    .map(toDueRow)
    .filter((r) => r.daysUntilDue < 0 || r.status === "overdue")
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  const upcomingDue = outstanding
    .map(toDueRow)
    .filter((r) => r.daysUntilDue >= 0 && r.daysUntilDue <= UPCOMING_DUE_DAYS)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  const monthPrefix = today.slice(0, 7);
  const collectedThisMonth = payments
    .filter((p) => p.status === "paid" && (p.paidAt ?? "").slice(0, 7) === monthPrefix)
    .reduce((sum, p) => sum + p.paidAmount, 0);
  const outstandingTotal = outstanding.reduce((sum, p) => sum + remainingOf(p), 0);
  const overdueTotal = overdue.reduce((sum, r) => sum + r.remaining, 0);

  // ---- Sözleşme izleme ---------------------------------------------------
  const contractWatch: ContractWatchRow[] = activeStudents
    .map((s): ContractWatchRow | null => {
      const contract = contractsByStudent.get(s.id);
      const base = { studentId: s.id, studentName: s.name, branchShortName: branchName(s.branchId) };
      if (!contract || contract.status === "cancelled") return { ...base, state: "missing" };
      const end = contract.enrollmentEndDate.slice(0, 10);
      const diff = dayDiff(today, end);
      if (diff < 0) return { ...base, state: "expired", endDate: end };
      if (diff <= CONTRACT_EXPIRY_WARNING_DAYS) return { ...base, state: "expiring", endDate: end };
      return null;
    })
    .filter((r): r is ContractWatchRow => r !== null)
    .sort((a, b) => {
      const order = { expired: 0, missing: 1, expiring: 2 } as const;
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
      return (a.endDate ?? "").localeCompare(b.endDate ?? "");
    });

  // ---- Öğretmen dikkat başlıkları ---------------------------------------
  const teacherAttention: TeacherAttentionRow[] = [];
  for (const t of data.teachers) {
    if (!inBranch(t)) continue;
    const assignedStudents = activeStudents.filter((s) => s.teacherId === t.id);
    if (!t.active && assignedStudents.length > 0) {
      teacherAttention.push({
        teacherId: t.id,
        teacherName: t.name,
        reason: `Pasif öğretmene ${assignedStudents.length} aktif öğrenci bağlı — atama güncellenmeli.`,
      });
      continue;
    }
    const mismatched = assignedStudents.filter((s) => !s.instruments.some((i) => t.instruments.includes(i)));
    if (mismatched.length > 0) {
      teacherAttention.push({
        teacherId: t.id,
        teacherName: t.name,
        reason: `${mismatched.length} öğrencinin enstrümanı bu öğretmenin verdiği derslerle uyuşmuyor.`,
      });
      continue;
    }
    const todayCount = lessonsToday.filter((l) => l.teacherId === t.id).length;
    if (t.maxDailyLessons > 0 && todayCount > t.maxDailyLessons) {
      teacherAttention.push({
        teacherId: t.id,
        teacherName: t.name,
        reason: `Bugün ${todayCount} ders — günlük limiti (${t.maxDailyLessons}) aşıyor.`,
      });
    }
  }

  // ---- İş takip ----------------------------------------------------------
  const openTasks = tasks.filter(
    (t) => inBranch(t) && t.status !== "COMPLETED" && t.status !== "CANCELLED" && t.status !== "ARCHIVED" && !t.archivedAt
  );
  const taskSummary = {
    open: openTasks.length,
    overdue: openTasks.filter((t) => t.dueDate && t.dueDate.slice(0, 10) < today).length,
    dueToday: openTasks.filter((t) => t.dueDate && t.dueDate.slice(0, 10) === today).length,
  };

  // ---- Telafi ------------------------------------------------------------
  const openMakeups = data.makeupRequests.filter(
    (m) =>
      inBranch(m) && (m.status === "pending" || m.status === "suggested" || m.status === "awaiting_info")
  );

  // ---- Aksiyon / bilgi ayrımı -------------------------------------------
  const actions: DashboardAction[] = [];
  if (overdueTotal > 0) {
    actions.push({
      key: "overdue",
      label: "Gecikmiş tahsilat",
      detail: `${overdue.length} kayıt · ${formatTl(overdueTotal)}`,
      href: "/panel/odemeler?status=overdue",
      tone: "danger",
      weight: 100,
    });
  }
  const awaiting = todayLessons.filter((l) => l.awaitingAttendance).length;
  if (awaiting > 0) {
    actions.push({
      key: "attendance",
      label: "Yoklama bekliyor",
      detail: `${awaiting} ders`,
      href: "/panel/yoklama",
      tone: "primary",
      weight: 90,
    });
  }
  const expiredOrMissing = contractWatch.filter((c) => c.state !== "expiring").length;
  if (expiredOrMissing > 0) {
    actions.push({
      key: "contracts",
      label: "Sözleşme eksik / süresi geçmiş",
      detail: `${expiredOrMissing} öğrenci`,
      href: "/panel/ogrenciler?contract=none&contract=expired",
      tone: "danger",
      weight: 85,
    });
  }
  if (openMakeups.length > 0) {
    actions.push({
      key: "makeup",
      label: "Telafi bekliyor",
      detail: `${openMakeups.length} talep`,
      href: "/panel/telafi",
      tone: "warning",
      weight: 70,
    });
  }
  if (taskSummary.overdue > 0) {
    actions.push({
      key: "tasks-overdue",
      label: "Gecikmiş görev",
      detail: `${taskSummary.overdue} görev`,
      href: "/panel/is-takip/liste",
      tone: "warning",
      weight: 65,
    });
  }
  if (teacherAttention.length > 0) {
    actions.push({
      key: "teachers",
      label: "Öğretmen ataması gözden geçirilmeli",
      detail: `${teacherAttention.length} başlık`,
      href: "/panel/ogretmenler",
      tone: "warning",
      weight: 60,
    });
  }
  actions.sort((a, b) => b.weight - a.weight);

  const signals: { key: string; label: string; detail: string }[] = [];
  const expiringSoon = contractWatch.filter((c) => c.state === "expiring").length;
  if (expiringSoon > 0) {
    signals.push({
      key: "contracts-expiring",
      label: "Yakında bitecek sözleşme",
      detail: `${expiringSoon} öğrenci (${CONTRACT_EXPIRY_WARNING_DAYS} gün içinde)`,
    });
  }
  if (upcomingDue.length > 0) {
    signals.push({
      key: "upcoming-due",
      label: "Yaklaşan vade",
      detail: `${upcomingDue.length} taksit (${UPCOMING_DUE_DAYS} gün içinde)`,
    });
  }
  if (taskSummary.dueToday > 0) {
    signals.push({ key: "tasks-today", label: "Bugün biten görev", detail: `${taskSummary.dueToday} görev` });
  }

  return {
    scope,
    actions,
    signals,
    todayLessons,
    branchLoad,
    overdue: overdue.slice(0, 8),
    upcomingDue: upcomingDue.slice(0, 8),
    contractWatch: contractWatch.slice(0, 10),
    teacherAttention,
    taskSummary,
    money: { collectedThisMonth, outstandingTotal, overdueTotal },
    counts: {
      activeStudents: activeStudents.length,
      activeTeachers: data.teachers.filter((t) => inBranch(t) && t.active).length,
      todayLessons: todayLessons.length,
      openMakeups: openMakeups.length,
    },
  };
}

function formatTl(amount: number): string {
  return `${new Intl.NumberFormat("tr-TR").format(Math.round(amount))} ₺`;
}

/** Ders satırının "şimdi" sırasındaki konumu — bugünün programında hizayı gösterir. */
export function lessonTimePosition(lesson: Pick<Lesson, "startAt" | "endAt">, now: Date): "past" | "now" | "next" {
  const start = new Date(lesson.startAt).getTime();
  const end = new Date(lesson.endAt).getTime();
  const t = now.getTime();
  if (t >= end) return "past";
  if (t >= start) return "now";
  return "next";
}
