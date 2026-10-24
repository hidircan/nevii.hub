/**
 * Sözleşmeli öğrencide ikinci borç: hiç tahsilat görmemiş `monthly_plan` satırı.
 *
 * Satır, öğrenci sözleşmesizken (veya yaşayan sözleşme özeti görünmezken) yazılır.
 * Sözleşme açılınca taksitler AYRI satırdır. "Sözleşmeye taşı" işaretlenmezse eski
 * satır silinmez, `contractId` almaz ve `debtSourceOf` onu "Sözleşmesiz aylık plan"
 * diye sayar. Ödemeler öğrenci kimliğine bakar, isme bakmaz.
 *
 * Yaşayan sözleşme taksidi aynı dönemi kapsıyorsa bu satır ikinci borç değildir.
 * Tahsilat görmüş satır, elle borç, kulüp ve farklı branş durur. Bu fonksiyon yazmaz.
 */
import { installmentMonthKeys, type CalendarPlanInstallment } from "./attendance-calendar-plan";
import { canonicalPaymentStatus } from "./payments/status";

export type PlanLinkRow = CalendarPlanInstallment & {
  id: string;
  studentId: string;
  enrollmentId?: string;
};

function livingContractMonths(
  rows: readonly PlanLinkRow[],
  terminalContractIds: ReadonlySet<string>
): { monthsByEnrollment: Map<string, Set<string>>; enrollmentIds: Set<string> } {
  const monthsByEnrollment = new Map<string, Set<string>>();
  const enrollmentIds = new Set<string>();
  for (const p of rows) {
    if (!p.contractId || terminalContractIds.has(p.contractId) || p.status === "voided") continue;
    const key = p.enrollmentId ?? "";
    if (p.enrollmentId) enrollmentIds.add(p.enrollmentId);
    let set = monthsByEnrollment.get(key);
    if (!set) monthsByEnrollment.set(key, (set = new Set()));
    for (const month of installmentMonthKeys(p)) set.add(month);
  }
  return { monthsByEnrollment, enrollmentIds };
}

function monthsOverlap(months: readonly string[], covered: Set<string> | undefined): boolean {
  return !!covered && months.some((month) => covered.has(month));
}

/** Aynı öğrenci + aynı dönem + uyumlu branş. Birden çok branşta bağsız satır tahmin edilmez. */
export function supersededUncollectedMonthlyPlanIds(
  payments: readonly PlanLinkRow[],
  terminalContractIds: ReadonlySet<string>
): Set<string> {
  const byStudent = new Map<string, PlanLinkRow[]>();
  for (const p of payments) {
    if (!p.studentId || !p.id) continue;
    const list = byStudent.get(p.studentId);
    if (list) list.push(p);
    else byStudent.set(p.studentId, [p]);
  }
  const drop = new Set<string>();
  for (const rows of byStudent.values()) {
    const { monthsByEnrollment, enrollmentIds } = livingContractMonths(rows, terminalContractIds);
    if (monthsByEnrollment.size === 0) continue;
    const singleEnrollment = enrollmentIds.size <= 1;
    for (const p of rows) {
      if (p.source !== "monthly_plan" || p.contractId) continue;
      if (p.status === "paid" || p.status === "voided" || p.paidAmount > 0) continue;
      if (Math.max(p.amount - p.paidAmount, 0) <= 0) continue;
      const months = installmentMonthKeys(p);
      const own = monthsByEnrollment.get(p.enrollmentId ?? "");
      let hit = monthsOverlap(months, own);
      if (!hit && !p.enrollmentId && singleEnrollment) {
        for (const covered of monthsByEnrollment.values()) {
          if (monthsOverlap(months, covered)) {
            hit = true;
            break;
          }
        }
      }
      if (hit) drop.add(p.id);
    }
  }
  return drop;
}

type StatusGroup = {
  studentId: string;
  status: string;
  contractId?: string;
  amount: number;
  paidAmount: number;
};

/**
 * Öğrenci listesinin gruplanmış borç tutarından, kanıt satırlarında ikinci borç
 * sayılan aylık plan kalanını düşer. Gruplar `toPaymentStatusRows` / liste SQL'i
 * ile aynı durum anahtarını kullanır. Yazmaz.
 */
export function subtractSupersededRemainders<T extends StatusGroup>(
  groups: readonly T[],
  evidence: readonly PlanLinkRow[],
  terminalContractIds: ReadonlySet<string>
): T[] {
  const drop = supersededUncollectedMonthlyPlanIds(evidence, terminalContractIds);
  if (drop.size === 0) return groups.map((g) => ({ ...g }));
  const next = groups.map((g) => ({ ...g }));
  for (const p of evidence) {
    if (!drop.has(p.id)) continue;
    const status =
      p.status === "paid" || p.status === "voided"
        ? p.status
        : canonicalPaymentStatus({ ...p, dueDate: p.dueDate, contractId: p.contractId });
    const due = Math.max(p.amount - p.paidAmount, 0);
    const group = next.find(
      (g) => g.studentId === p.studentId && g.status === status && (g.contractId ?? "") === "" && g.paidAmount === 0
    );
    if (!group) continue;
    group.amount = Math.max(0, group.amount - due);
  }
  return next.filter((g) => g.status === "paid" || g.amount > 0);
}
