/**
 * 2026-10-23 — SÖZLEŞMESİZ AYLIK TAHAKKUK SATIRININ TEK YAZMA NOKTASI.
 *
 * Gece tahakkuku, sözleşme oluşturma ve sözleşme iptali sözleşmesiz `monthly_plan` satırını yalnız buradan
 * açar / askıya alır / yeniden açar / yeniden fiyatlar:
 * - Öğrenci başına kilit (db: `pg_advisory_xact_lock`, json/memory: store kilidi) altında satırlar TAZE okunur;
 *   karar (`resolveAccrualOp`, saf) ve yazım aynı kilit içindedir → cron ile sözleşme oluşturma aynı anda çalışsa da
 *   aynı ay için ikinci açık borç oluşmaz.
 * - Açma/yeniden açma/yeniden fiyatlama, kilit içinde sözleşme durumu TAZE okunarak (planlayıcıyla aynı kural)
 *   yeniden kontrol edilir: arada sözleşme açıldıysa yazılmaz.
 * - Yalnız HİÇ tahsilat görmemiş satır değişir; yazım `paidAmount = 0 AND paidAt IS NULL` koşulludur (arada tahsilat
 *   girildiyse satıra dokunulmaz). Satır silinmez.
 * - Askıya alma = iptal + `adjustedBy` etiketi (`system:accrual` / `system:contract:<id>`) + okunur gerekçe. Etiketli
 *   iptal ayı "karşılamaz"; öğrenci yeniden uygun olunca AYNI satır yeniden açılır. Etiketsiz (yönetici) iptal o ayı
 *   bilinçli olarak kapatır ve asla otomatik açılmaz.
 */
import { isDbMode, isMemoryMode } from "../config";
import { isMonthlyPlanRowForMonth, installmentMonthKeys, monthlyPlanPeriodLabel } from "../attendance-calendar-plan";
import { matchesEnrollmentScope } from "../student-enrollments";
import { resolveCollectionStatus, remainingAmount } from "./status";
import { uid } from "../utils";
import type { Payment } from "../types";
import type { StudentContractSummary } from "../contracts";

export const ACCRUAL_SUSPENDED_TAG = "system:accrual";
export const contractSuspensionTag = (contractId: string) => `system:contract:${contractId}`;
const ACCRUAL_SUSPENDED_REASON =
  "Otomatik askıya alındı: öğrenci bu dönem için sözleşmesiz ödeme yükümlülüğüne uygun değil (pasif, ödeme durdurma, kayıt bitişi veya sözleşme). Uygun hale gelince aynı satır yeniden açılır.";
const contractSuspendedReason = (contractNumber: string) =>
  `${contractNumber} numaralı sözleşme bu dönemi kapsıyor; sözleşmesiz borç askıya alındı. Sözleşme iptal edilirse yeniden açılır.`;

export type PlanRow = Pick<
  Payment,
  | "id" | "studentId" | "source" | "contractId" | "status" | "amount" | "paidAmount" | "paidAt" | "dueDate" | "description"
  | "installmentPeriodLabel" | "enrollmentId" | "adjustedBy"
>;

/** Hiç tahsilat görmemiş, sözleşmeye bağlı olmayan aylık plan satırı (değiştirilebilir tek satır türü). */
export function isUntouchedPlanRow(p: Pick<Payment, "source" | "contractId" | "paidAmount" | "paidAt">): boolean {
  return p.source === "monthly_plan" && !p.contractId && Math.trunc(p.paidAmount) === 0 && !p.paidAt;
}

/** Sistemin askıya aldığı satırın etiketi; yönetici iptali / canlı satır için undefined. */
export function suspensionTagOf(p: Pick<Payment, "source" | "contractId" | "paidAmount" | "paidAt" | "status" | "adjustedBy">): string | undefined {
  return isUntouchedPlanRow(p) && p.status === "voided" && p.adjustedBy?.startsWith("system:") ? p.adjustedBy : undefined;
}

type Scope = { enrollmentId?: string; includeUnlinked: boolean };

export type AccrualOp =
  /** Ayın yükümlülüğü: canlı satır varsa dokunma, askıdaysa yeniden aç, yönetici iptal ettiyse dokunma, yoksa yaz. */
  | ({ kind: "ensure"; month: string; amount: number } & Scope)
  /** Belirli askıdaki satırı yeniden aç (sözleşme iptali). */
  | { kind: "resume"; paymentId: string; amount: number }
  /** Tahsilat görmemiş canlı satırın tutarı (gelecek ay, ücret değişti). */
  | { kind: "reprice"; paymentId: string; amount: number }
  /** Tahsilat görmemiş canlı satırı askıya al (gelecek ay, öğrenci artık uygun değil). */
  | { kind: "suspend"; paymentId: string }
  /** Sözleşmenin kapsadığı aylardaki tüm tahsilat görmemiş canlı satırları askıya al (sözleşme oluşturma). */
  | ({
      kind: "suspendForContract"; contractId: string; contractNumber: string; fromMonth: string; toMonth: string;
      /** Yöneticinin "sözleşmeye taşı" ile seçtiği satırlar: aynı adımda taşındı notu da yazılır. */
      carriedOverIds?: string[];
    } & Scope)
  /** Sözleşme oluşturma GERİ ALINDI: o sözleşmenin askıya aldığı satırlar aynen eski haline (sözleşme kontrolü yok). */
  | { kind: "releaseContract"; contractId: string };

type RowPatch = Partial<Pick<Payment, "status" | "amount" | "adjustedBy" | "adjustmentReason" | "adjustedAt" | "paymentNote">>;
export type AccrualWrite =
  | { kind: "update"; id: string; patch: RowPatch; reopened?: true }
  | { kind: "create"; row: Payment }
  | { kind: "skip"; reason: string };

/** Açma/yeniden açma/yeniden fiyatlama — kilit içinde sözleşme yeniden kontrolüne tabidir. */
const OPENING_KINDS = new Set<AccrualOp["kind"]>(["ensure", "resume", "reprice"]);
// Tahsilat görmemiş satırda not yalnız sistemin yazdığı "taşındı" notu olabilir; yeniden açılınca o da kalkar.
const CLEAR_MARK = { adjustedBy: undefined, adjustmentReason: undefined, adjustedAt: undefined, paymentNote: undefined } as const;

function openStatus(amount: number, dueDate: string, now: Date): Payment["status"] {
  return resolveCollectionStatus({ amount, paidAmount: 0, dueDate, now });
}

/** Saf: tek işlemin, öğrencinin GÜNCEL sözleşmesiz aylık plan satırları üzerindeki etkisi. */
export function resolveAccrualOp(rows: PlanRow[], op: AccrualOp, studentId: string, now: Date): AccrualWrite[] {
  const nowIso = now.toISOString();
  if (op.kind === "ensure") {
    const scope = { enrollmentId: op.enrollmentId, includeUnlinked: op.includeUnlinked };
    const same = rows.filter(
      (p) => p.source === "monthly_plan" && !p.contractId && isMonthlyPlanRowForMonth(p, op.month) && matchesEnrollmentScope(p.enrollmentId, scope)
    );
    if (same.some((p) => p.status !== "voided")) return [{ kind: "skip", reason: "exists" }];
    const suspended = same.find((p) => suspensionTagOf(p));
    if (suspended) {
      return [{ kind: "update", id: suspended.id, reopened: true, patch: { status: openStatus(op.amount, suspended.dueDate, now), amount: op.amount, ...CLEAR_MARK } }];
    }
    if (same.length > 0) return [{ kind: "skip", reason: "admin_voided" }];
    const dueDate = new Date(`${op.month}-01T12:00:00.000Z`).toISOString();
    return [
      {
        kind: "create",
        row: {
          id: uid("pay"),
          studentId,
          amount: op.amount,
          paidAmount: 0,
          status: openStatus(op.amount, dueDate, now),
          dueDate,
          description: `Aylık plan — ${op.month} (${op.amount} TL)`,
          installmentPeriodLabel: monthlyPlanPeriodLabel(op.month),
          source: "monthly_plan",
          createdAt: nowIso,
          ...(op.enrollmentId ? { enrollmentId: op.enrollmentId } : {}),
        },
      },
    ];
  }
  if (op.kind === "suspendForContract") {
    const scope = { enrollmentId: op.enrollmentId, includeUnlinked: op.includeUnlinked };
    return rows
      .filter(
        (p) =>
          isUntouchedPlanRow(p) &&
          p.status !== "voided" &&
          matchesEnrollmentScope(p.enrollmentId, scope) &&
          installmentMonthKeys(p).some((m) => m >= op.fromMonth && m <= op.toMonth)
      )
      .map((p) => ({
        kind: "update" as const,
        id: p.id,
        patch: {
          status: "voided" as const,
          adjustedBy: contractSuspensionTag(op.contractId),
          adjustmentReason: contractSuspendedReason(op.contractNumber),
          adjustedAt: nowIso,
          ...(op.carriedOverIds?.includes(p.id) ? { paymentNote: `Sözleşme ${op.contractNumber} planına taşındı (yeniden borçlandırılmadı).` } : {}),
        },
      }));
  }
  if (op.kind === "releaseContract") {
    const tag = contractSuspensionTag(op.contractId);
    return rows
      .filter((p) => suspensionTagOf(p) === tag)
      .map((p) => ({ kind: "update" as const, id: p.id, reopened: true as const, patch: { status: openStatus(p.amount, p.dueDate, now), ...CLEAR_MARK } }));
  }
  const row = rows.find((p) => p.id === op.paymentId);
  if (!row || !isUntouchedPlanRow(row)) return [{ kind: "skip", reason: "touched_or_missing" }];
  if (op.kind === "resume") {
    if (!suspensionTagOf(row)) return [{ kind: "skip", reason: "not_suspended" }];
    // Aynı ay + branş için zaten açık/tahsil edilmiş bir satır varsa açılmaz (çift borç yok).
    const month = installmentMonthKeys(row)[0];
    const taken = rows.some(
      (p) =>
        p.id !== row.id &&
        p.status !== "voided" &&
        !!month &&
        isMonthlyPlanRowForMonth(p, month) &&
        matchesEnrollmentScope(p.enrollmentId, { enrollmentId: row.enrollmentId, includeUnlinked: true })
    );
    if (taken) return [{ kind: "skip", reason: "month_taken" }];
    return [{ kind: "update", id: row.id, reopened: true, patch: { status: openStatus(op.amount, row.dueDate, now), amount: op.amount, ...CLEAR_MARK } }];
  }
  if (row.status === "voided") return [{ kind: "skip", reason: "voided" }];
  if (op.kind === "reprice") {
    if (Math.trunc(row.amount) === op.amount) return [{ kind: "skip", reason: "same_amount" }];
    return [{ kind: "update", id: row.id, patch: { amount: op.amount, status: openStatus(op.amount, row.dueDate, now) } }];
  }
  return [{ kind: "update", id: row.id, patch: { status: "voided", adjustedBy: ACCRUAL_SUSPENDED_TAG, adjustmentReason: ACCRUAL_SUSPENDED_REASON, adjustedAt: nowIso } }];
}

/**
 * Kilit içinde uygulanan sözleşme kontrolü: true → bu branş/öğrenci için açma yapılmaz (yaşayan sözleşme var).
 * Çağıran, planlayıcının kuralıyla (`selectCurrentContract` + `contractEnrollmentId`) kurar.
 */
export type ContractGate = (contracts: StudentContractSummary[], enrollmentId: string | undefined) => boolean;

function opEnrollmentId(rows: PlanRow[], op: AccrualOp): string | undefined {
  if ("paymentId" in op) return rows.find((p) => p.id === op.paymentId)?.enrollmentId;
  return "enrollmentId" in op ? op.enrollmentId : undefined;
}

/** Bir öğrencinin tahakkuk işlemlerini kilit altında, taze satırlarla uygular. Dönen: uygulanan yazımlar. */
export async function applyAccrualOps(
  tenantId: string,
  studentId: string,
  ops: AccrualOp[],
  opts: { actorUserId: string; gate?: ContractGate; now?: Date }
): Promise<AccrualWrite[]> {
  if (ops.length === 0) return [];
  const now = opts.now ?? new Date();
  const decide = (rows: PlanRow[], contracts: StudentContractSummary[]) => {
    const writes: AccrualWrite[] = [];
    for (const op of ops) {
      if (opts.gate && OPENING_KINDS.has(op.kind) && opts.gate(contracts, opEnrollmentId(rows, op))) {
        writes.push({ kind: "skip", reason: "live_contract" });
        continue;
      }
      for (const w of resolveAccrualOp(rows, op, studentId, now)) {
        writes.push(w);
        // Sonraki işlemler aynı kilit içindeki güncel hali görsün (aynı ay için iki "ensure" ikinci satır üretmez).
        if (w.kind === "create") rows.push(w.row);
        if (w.kind === "update") rows = rows.map((p) => (p.id === w.id ? { ...p, ...w.patch } : p));
      }
    }
    return writes;
  };
  return isDbMode ? applyDb(tenantId, studentId, decide, opts) : applyFile(tenantId, studentId, decide, opts);
}

type Decide = (rows: PlanRow[], contracts: StudentContractSummary[]) => AccrualWrite[];

function casePayload(tenantId: string, id: string, amount: number, status: string, actorUserId: string) {
  return { tenantId, paymentId: id, paidAmount: 0, remaining: status === "voided" ? 0 : remainingAmount(amount, 0), paymentStatus: status, actorUserId };
}

async function applyDb(tenantId: string, studentId: string, decide: Decide, opts: { actorUserId: string; gate?: ContractGate }): Promise<AccrualWrite[]> {
  const { prisma } = await import("../db");
  const { CONTRACT_SUMMARY_SELECT, toContractSummaryRow } = await import("../contracts");
  const { syncFollowUpCasesFromPaymentTx } = await import("../tahsilat/cases");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${`accrual:${studentId}`}))`;
    const student = await tx.student.findFirst({ where: { id: studentId, tenantId }, select: { schoolId: true } });
    if (!student) return [];
    const contracts = opts.gate
      ? (await tx.studentContract.findMany({ where: { tenantId, studentId }, select: CONTRACT_SUMMARY_SELECT, orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }] })).map(toContractSummaryRow)
      : [];
    const found = await tx.payment.findMany({
      where: { tenantId, studentId, source: "monthly_plan", contractId: null },
      select: {
        id: true, studentId: true, source: true, contractId: true, status: true, amount: true, paidAmount: true, paidAt: true,
        dueDate: true, description: true, installmentPeriodLabel: true, enrollmentId: true, adjustedBy: true,
      },
    });
    const rows: PlanRow[] = found.map((p) => ({
      ...p,
      source: p.source as Payment["source"],
      status: p.status as Payment["status"],
      contractId: undefined,
      paidAt: p.paidAt?.toISOString(),
      dueDate: p.dueDate.toISOString(),
      installmentPeriodLabel: p.installmentPeriodLabel ?? undefined,
      enrollmentId: p.enrollmentId ?? undefined,
      adjustedBy: p.adjustedBy ?? undefined,
    }));
    const applied: AccrualWrite[] = [];
    for (const w of decide(rows, contracts)) {
      if (w.kind === "skip") continue;
      if (w.kind === "create") {
        const r = w.row;
        await tx.payment.create({
          data: {
            id: r.id, tenantId, studentId, schoolId: student.schoolId, amount: r.amount, paidAmount: 0, status: r.status,
            dueDate: new Date(r.dueDate), description: r.description, installmentPeriodLabel: r.installmentPeriodLabel, source: "monthly_plan",
            ...(r.enrollmentId ? { enrollmentId: r.enrollmentId } : {}),
          },
        });
        applied.push(w);
        continue;
      }
      const p = w.patch;
      const { count } = await tx.payment.updateMany({
        // Koşullu: arada tahsilat girildiyse (paidAmount/paidAt) satıra dokunulmaz.
        where: { id: w.id, tenantId, source: "monthly_plan", contractId: null, paidAmount: 0, paidAt: null },
        data: {
          ...(p.status !== undefined ? { status: p.status } : {}),
          ...(p.amount !== undefined ? { amount: p.amount } : {}),
          ...("adjustedBy" in p ? { adjustedBy: p.adjustedBy ?? null, adjustmentReason: p.adjustmentReason ?? null, adjustedAt: p.adjustedAt ? new Date(p.adjustedAt) : null } : {}),
          ...("paymentNote" in p ? { paymentNote: p.paymentNote ?? null } : {}),
        },
      });
      if (count === 0) continue;
      applied.push(w);
      if (p.status !== undefined) {
        const amount = p.amount ?? rows.find((x) => x.id === w.id)?.amount ?? 0;
        await syncFollowUpCasesFromPaymentTx(tx, casePayload(tenantId, w.id, amount, p.status, opts.actorUserId));
      }
    }
    return applied;
  });
}

async function applyFile(tenantId: string, studentId: string, decide: Decide, opts: { actorUserId: string; gate?: ContractGate }): Promise<AccrualWrite[]> {
  const store = isMemoryMode ? await import("../store-memory") : await import("../store-json");
  const contracts = opts.gate ? await (await import("../contracts")).listContractSummaryRows(tenantId, studentId) : [];
  let applied: AccrualWrite[] = [];
  const next = await store.mutateStoreUnderLock(async (data) => {
    if (!data.students.some((s) => s.id === studentId)) return data;
    const rows = data.payments.filter((p) => p.studentId === studentId && p.source === "monthly_plan" && !p.contractId);
    applied = decide(rows, contracts).filter((w) => w.kind !== "skip");
    let payments = data.payments;
    for (const w of applied) {
      if (w.kind === "create") payments = [...payments, w.row];
      else if (w.kind === "update") payments = payments.map((p) => (p.id === w.id && isUntouchedPlanRow(p) ? { ...p, ...w.patch } : p));
    }
    return { ...data, payments };
  });
  const { syncFollowUpCasesFromPayment } = await import("../tahsilat/cases");
  for (const w of applied) {
    if (w.kind !== "update" || w.patch.status === undefined) continue;
    const row = next.payments.find((p) => p.id === w.id);
    if (row) await syncFollowUpCasesFromPayment(casePayload(tenantId, row.id, row.amount, row.status, opts.actorUserId));
  }
  return applied;
}
