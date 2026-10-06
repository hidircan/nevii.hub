/**
 * 2026-10-05 — SÖZLEŞMESİZ AYLIK TAHAKKUK (owner kararı). Kök neden: sözleşmesiz öğrencinin aylık
 * ücreti hiçbir yerde borç olarak yazılmıyordu; `monthly_plan` satırı yalnız tahsilat anında açılıyordu
 * (tools.ts takvim tahsilatı). Bu yüzden Öğrenciler listesi ve detay, ilk tahsilattan sonraki ayları
 * borç olarak hiç göremiyordu.
 *
 * Kural: aktif, silinmemiş, ödeme durdurması olmayan, aylık ücreti > 0, yaşayan (iptal/yenilenmiş
 * olmayan) sözleşmesi OLMAYAN öğrenciye, kayıt ayından SONRAKİ her ay için — o ay zaten bir kayıt ilk
 * tahsilatı (sonraki ayı kapsayan dahil) veya aylık plan satırıyla karşılanmıyorsa — aylık ücret kadar
 * TEK `monthly_plan` satırı (`upsertMonthlyPlanPayment`, ayın 1'i vadeli) yazılır. Yalnız İÇİNDE
 * bulunulan ay; geçmiş aylar otomatik doldurulmaz. Mevcut satırlar değişmez; tekrar çalıştırmak ikinci
 * satır üretmez. Sözleşme açılınca mevcut "sözleşmeye taşı" akışı bu satırları devralır.
 */
import { installmentMonthKeys, isMonthlyPlanRowForMonth } from "./attendance-calendar-plan";
import { isTerminalContractStatus } from "./contract-list-helpers";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "./timezone";
import type { Payment, Student } from "./types";

export type StandaloneAccrual = { studentId: string; month: string; amount: number };

function nextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Bu öğrenci satırı (sözleşmesiz plan) verilen ayı karşılıyor mu? */
function coversMonth(p: Payment, month: string): boolean {
  if (p.contractId) return false;
  if (p.source === "monthly_plan") {
    // 2026-10-06 — dönem ayı TEK kuraldan (etiket → açıklama ayı → vade; `isMonthlyPlanRowForMonth`), iptal dahil.
    // Tahsilat tarihi (önceki ayda/yılda alınmış olsa bile) dönemi değiştirmez; `upsertMonthlyPlanPayment` da aynı kuralla
    // eşleştirir, bu yüzden aynı dönem ikinci kez borçlandırılmaz.
    return isMonthlyPlanRowForMonth(p, month);
  }
  if (p.status === "voided" || p.source !== "registration_first_payment") return false;
  const months = installmentMonthKeys(p);
  if (p.firstCollectionIncludesNextMonth) {
    months.push(nextMonthKey(p.dueDate.slice(0, 7)));
  }
  return months.includes(month);
}

/** Saf: verilen ay için yazılması gereken sözleşmesiz aylık plan satırları. */
export function planStandaloneMonthlyAccruals(input: {
  students: Student[];
  payments: Payment[];
  /** Öğrenci başına güncel sözleşme durumu (`listContractSummariesByStudent`). */
  contractStatusByStudent: ReadonlyMap<string, string>;
  month: string;
}): StandaloneAccrual[] {
  const out: StandaloneAccrual[] = [];
  for (const s of input.students) {
    if (!s.active || s.deletedAt || s.paymentPauseStatus === "paused") continue;
    if (!(s.monthlyFee > 0)) continue;
    const contractStatus = input.contractStatusByStudent.get(s.id);
    if (contractStatus && !isTerminalContractStatus(contractStatus)) continue;
    const startMonth = s.enrollmentStartDate?.slice(0, 7);
    // Kayıt ayı ilk tahsilatın ayıdır; tarihsiz kayıt için tahmin yapılmaz.
    if (!startMonth || input.month <= startMonth) continue;
    if (s.enrollmentEndDate && s.enrollmentEndDate.slice(0, 7) < input.month) continue;
    if (input.payments.some((p) => p.studentId === s.id && coversMonth(p, input.month))) continue;
    out.push({ studentId: s.id, month: input.month, amount: s.monthlyFee });
  }
  return out;
}

/** Tek kurum — çağıran kurum kapsamını (ALS) kurmuş olmalı. `apply:false` yalnız planı döndürür. */
export async function runStandaloneMonthlyAccrual(
  tenantId: string,
  opts: { apply: boolean; now?: Date }
): Promise<{ month: string; planned: StandaloneAccrual[]; created: number }> {
  const [{ readPaymentsPageData, upsertMonthlyPlanPayment }, { listContractSummariesByStudent }, { recordAuditLog }] =
    await Promise.all([import("./store"), import("./contracts"), import("./audit/log")]);
  const month = toZonedYmd(opts.now ?? new Date(), DEFAULT_APP_TIMEZONE).slice(0, 7);
  const data = await readPaymentsPageData();
  const summaries = await listContractSummariesByStudent(tenantId);
  const planned = planStandaloneMonthlyAccruals({
    students: data.students,
    payments: data.payments,
    contractStatusByStudent: new Map([...summaries].map(([id, c]) => [id, c.status])),
    month,
  });
  let created = 0;
  if (opts.apply) {
    // Sıralı: json store'da eşzamanlı yazım yarışmasın.
    for (const a of planned) {
      const { paymentId } = await upsertMonthlyPlanPayment({ studentId: a.studentId, month: a.month, amount: a.amount });
      created++;
      await recordAuditLog({
        tenantId,
        actorUserId: "cron",
        actorRole: "SYSTEM",
        action: "payment.standalone_monthly_accrual",
        entityType: "Payment",
        entityId: paymentId,
        outcome: "success",
        meta: { studentId: a.studentId, month: a.month, amount: a.amount },
      });
    }
  }
  return { month, planned, created };
}
