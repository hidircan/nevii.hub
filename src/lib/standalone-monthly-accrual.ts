/**
 * 2026-10-05 — SÖZLEŞMESİZ AYLIK TAHAKKUK (owner kararı). Kök neden: sözleşmesiz öğrencinin aylık
 * ücreti hiçbir yerde borç olarak yazılmıyordu; `monthly_plan` satırı yalnız tahsilat anında açılıyordu
 * (tools.ts takvim tahsilatı). Bu yüzden Öğrenciler listesi ve detay, ilk tahsilattan sonraki ayları
 * borç olarak hiç göremiyordu.
 *
 * Kural: aktif, silinmemiş, ödeme durdurması olmayan, aylık ücreti > 0, yaşayan (iptal/yenilenmiş
 * olmayan) sözleşmesi OLMAYAN öğrenciye, kayıt ayından SONRAKİ her ay için — o ay zaten bir kayıt ilk
 * tahsilatı (sonraki ayı kapsayan dahil) veya aylık plan satırıyla karşılanmıyorsa — aylık ücret kadar
 * TEK `monthly_plan` satırı (`upsertMonthlyPlanPayment`, ayın 1'i vadeli) yazılır. İçinde bulunulan ay VE
 * gelecek ay; geçmiş aylar otomatik doldurulmaz. Tekrar çalıştırmak ikinci satır üretmez.
 *
 * 2026-10-23 — GELECEK AY (yaklaşan borç): eskiden yalnız içinde bulunulan ay yazılıyordu; sözleşmesiz öğrencinin
 * gelecek ay yükümlülüğü ayın 1'ine kadar HİÇBİR ekranda yoktu (Yoklama Takvimi, Ödemeler ay panosu, Açık borçlar
 * hepsi satır okur), sözleşmeli öğrencinin taksitleri ise baştan görünüyordu (Darya Ö. — Kasım boş). Gelecek ayın
 * satırı GEÇİCİdir: tahsilat görmediği sürece her gece aynı kurala göre senkronlanır — öğrenci artık uygun değilse
 * (pasif, durdurma, kayıt bitişi, yaşayan sözleşme, başka satır o ayı karşılıyor) iptal edilir. Tutar, içinde bulunulan
 * ayın satırı gibi yazıldığı andaki ücrettir (yeniden fiyatlanmaz). İçinde bulunulan ayın satırına dokunulmaz.
 */
import { installmentMonthKeys, installmentMonthShares, isMonthlyPlanRowForMonth } from "./attendance-calendar-plan";
import { contractSuspensionTag, isUntouchedPlanRow, suspensionTagOf, type AccrualOp, type AccrualWrite, type ContractGate } from "./payments/accrual-rows";
import { selectCurrentContract } from "./contract-list-helpers";
import { shiftMonth } from "./payment-month-view";
import { isTerminalContractStatus } from "./contract-list-helpers";
import { contractEnrollmentId, effectiveEnrollments, enrollmentTerms, isPersistedEnrollmentId, paymentEnrollmentId } from "./student-enrollments";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "./timezone";
import type { Lesson, Payment, StudentRef, Teacher } from "./types";
import type { StudentContractSummary } from "./contracts";

/**
 * 2026-10-09 — ÇOK BRANŞ: tahakkuk BRANŞ başınadır — her aktif branş kendi aylık ücreti, kayıt/bitiş tarihi ve kendi
 * güncel sözleşmesiyle değerlendirilir; bir branşın sözleşmesi/ödemesi diğerini "karşılamaz". Tek branşlı (ve branş
 * kaydı olmayan eski) öğrencide davranış birebir eskisidir. `enrollmentId` yazılacak satırın branşıdır.
 */
export type StandaloneAccrual = { studentId: string; month: string; amount: number; enrollmentId?: string };

/** Bu öğrenci satırı (sözleşmesiz plan) verilen ayı karşılıyor mu? */
function coversMonth(p: Payment, month: string): boolean {
  // 2026-10-23 — sözleşme taksidi (iptal/yenilenmiş sözleşmeninki dahil) yalnız o aya FİİLEN tahsilat aldıysa karşılar:
  // iptal edilen sözleşmeyle ödenmiş ay yeniden borçlandırılmaz. (Yaşayan sözleşmesi olan öğrenci zaten tahakkuk dışıdır.)
  if (p.contractId) return Math.trunc(p.paidAmount) > 0 && installmentMonthShares(p).some((s) => s.month === month && s.paidAmount > 0);
  if (p.source === "monthly_plan") {
    // 2026-10-06 — dönem ayı TEK kuraldan (etiket → açıklama ayı → vade; `isMonthlyPlanRowForMonth`), iptal dahil.
    // Tahsilat tarihi (önceki ayda/yılda alınmış olsa bile) dönemi değiştirmez; aynı dönem ikinci kez borçlandırılmaz.
    // 2026-10-23 — SİSTEMİN askıya aldığı satır karşılamaz (öğrenci yeniden uygun olunca aynı satır açılır); yönetici
    // iptali karşılar (o ay bilinçli olarak kapatılmıştır).
    if (suspensionTagOf(p)) return false;
    return isMonthlyPlanRowForMonth(p, month);
  }
  if (p.status === "voided" || p.source !== "registration_first_payment") return false;
  // 2026-10-14 — "takip eden ayı da ekle" kapsamı TEK kuraldan (`installmentMonthShares`): takvim ve döküm de aynı
  // fonksiyonu okur. Eskiden burada vade (tahsilat) ayı + 1 ayrıca hesaplanıyordu; takvim bu bayrağı hiç okumadığı
  // için sözleşmesiz öğrencide sonraki ay tahakkuk edilmiyor ama takvimde "ödeme kaydı yok" görünüyordu.
  return installmentMonthKeys(p).includes(month);
}

/** Saf: verilen ay için yazılması gereken sözleşmesiz aylık plan satırları. */
export function planStandaloneMonthlyAccruals(input: {
  students: StudentRef[];
  payments: Payment[];
  /** Öğrenci başına güncel sözleşme durumu (`listContractSummariesByStudent`) — tek branşlı/eski öğrenci. */
  contractStatusByStudent: ReadonlyMap<string, string>;
  /** Çok branşlı öğrencide branş başına güncel sözleşme durumu — anahtar `${studentId}:${enrollmentId}`. */
  contractStatusByBranch?: ReadonlyMap<string, string>;
  teachers?: Pick<Teacher, "id" | "instruments">[];
  lessons?: Pick<Lesson, "id" | "enrollmentId" | "instrument" | "teacherId">[];
  month: string;
}): StandaloneAccrual[] {
  const out: StandaloneAccrual[] = [];
  for (const s of input.students) {
    if (!s.active || s.deletedAt || s.paymentPauseStatus === "paused") continue;
    const branches = effectiveEnrollments(s, input.teachers);
    if (branches.length > 1) {
      // Branşı belirtilmemiş eski bir satır bu ayı karşılıyorsa hiçbir branşa otomatik borç yazılmaz (hangi branşın
      // ayı olduğu belirsiz — çift borç riski); satır "Branşa bağla" ile bağlanınca sonraki çalıştırma doğru karar verir.
      const unassignedCovers = input.payments.some(
        (p) =>
          p.studentId === s.id &&
          p.source !== "club" &&
          !paymentEnrollmentId(s, p, { lessons: input.lessons }, input.teachers) &&
          coversMonth(p, input.month)
      );
      if (unassignedCovers) continue;
      for (const e of branches) {
        if (!e.active) continue;
        const terms = enrollmentTerms(s, e, input.teachers);
        if (!(terms.monthlyFee > 0)) continue;
        const status = input.contractStatusByBranch?.get(`${s.id}:${e.id}`);
        if (status && !isTerminalContractStatus(status)) continue;
        const startMonth = terms.startDate?.slice(0, 7);
        if (!startMonth || input.month <= startMonth) continue;
        if (terms.endDate && terms.endDate.slice(0, 7) < input.month) continue;
        const covered = input.payments.some(
          (p) =>
            p.studentId === s.id &&
            paymentEnrollmentId(s, p, { lessons: input.lessons }, input.teachers) === e.id &&
            coversMonth(p, input.month)
        );
        if (covered) continue;
        out.push({ studentId: s.id, month: input.month, amount: terms.monthlyFee, enrollmentId: e.id });
      }
      continue;
    }
    if (!(s.monthlyFee > 0)) continue;
    const contractStatus = input.contractStatusByStudent.get(s.id);
    if (contractStatus && !isTerminalContractStatus(contractStatus)) continue;
    const startMonth = s.enrollmentStartDate?.slice(0, 7);
    // Kayıt ayı ilk tahsilatın ayıdır; tarihsiz kayıt için tahmin yapılmaz.
    if (!startMonth || input.month <= startMonth) continue;
    if (s.enrollmentEndDate && s.enrollmentEndDate.slice(0, 7) < input.month) continue;
    if (input.payments.some((p) => p.studentId === s.id && coversMonth(p, input.month))) continue;
    const sole = branches[0];
    out.push({ studentId: s.id, month: input.month, amount: s.monthlyFee, ...(sole && isPersistedEnrollmentId(sole.id) ? { enrollmentId: sole.id } : {}) });
  }
  return out;
}


type AccrualPlanInput = Parameters<typeof planStandaloneMonthlyAccruals>[0];

/**
 * Saf: GELECEK ay senkronu — aynı kural (`planStandaloneMonthlyAccruals`) tahsilat görmemiş canlı satırlar YOKMUŞ gibi
 * çalıştırılır; eşleşen satır kalır (ücret değiştiyse yeni tutar), eşleşmeyen askıya alınır, kalan yükümlülükler
 * `ensure` ile yazılır (askıdaki satır varsa O açılır). "Yaklaşan borç" ile "olması gereken borç" tek kuraldan gelir.
 */
export function planUpcomingAccrualSync(input: AccrualPlanInput): {
  create: StandaloneAccrual[];
  suspendIds: string[];
  reprice: { paymentId: string; studentId: string; amount: number }[];
} {
  const provisional = input.payments.filter((p) => isUntouchedPlanRow(p) && p.status !== "voided" && isMonthlyPlanRowForMonth(p, input.month));
  const ids = new Set(provisional.map((p) => p.id));
  const due = planStandaloneMonthlyAccruals({ ...input, payments: input.payments.filter((p) => !ids.has(p.id)) });
  const used = new Set<StandaloneAccrual>();
  const suspendIds: string[] = [];
  const reprice: { paymentId: string; studentId: string; amount: number }[] = [];
  for (const p of provisional) {
    const match = due.find(
      (a) => !used.has(a) && a.studentId === p.studentId && (!a.enrollmentId || !p.enrollmentId || a.enrollmentId === p.enrollmentId)
    );
    if (!match) {
      suspendIds.push(p.id);
      continue;
    }
    used.add(match);
    if (Math.trunc(p.amount) !== match.amount) reprice.push({ paymentId: p.id, studentId: p.studentId, amount: match.amount });
  }
  return { create: due.filter((a) => !used.has(a)), suspendIds, reprice };
}

/**
 * Saf: iptal edilen sözleşmenin askıya aldığı sözleşmesiz satırlar (geçmiş aylar dahil) yeniden açılır — o aya
 * iptal edilen sözleşmeden FİİLEN tahsilat alınmışsa açılmaz (ay ödenmiş; çift borç olmaz).
 */
export function planContractCancelRestore(payments: Payment[], contractId: string): { paymentId: string; studentId: string; amount: number }[] {
  const tag = contractSuspensionTag(contractId);
  return payments
    .filter((p) => suspensionTagOf(p) === tag)
    .filter((p) => {
      const month = installmentMonthKeys(p)[0];
      return !payments.some(
        (c) => c.contractId === contractId && Math.trunc(c.paidAmount) > 0 && installmentMonthShares(c).some((s) => s.month === month && s.paidAmount > 0)
      );
    })
    .map((p) => ({ paymentId: p.id, studentId: p.studentId, amount: Math.trunc(p.amount) }));
}

/** Planlayıcının sözleşme kuralı (tek branş: öğrencinin güncel sözleşmesi; çok branş: branşın güncel sözleşmesi). */
function contractStatusMaps(
  students: StudentRef[],
  teachers: Pick<Teacher, "id" | "instruments">[],
  rows: StudentContractSummary[],
  byStudent: Map<string, StudentContractSummary>
) {
  const contractStatusByBranch = new Map<string, string>();
  for (const st of students) {
    const branches = effectiveEnrollments(st, teachers);
    if (branches.length < 2) continue;
    const own = rows.filter((r) => r.studentId === st.id).map((r) => ({ ...r, id: r.contractId }));
    for (const e of branches) {
      const current = selectCurrentContract(own.filter((r) => contractEnrollmentId(st, r, teachers) === e.id));
      if (current) contractStatusByBranch.set(`${st.id}:${e.id}`, current.status);
    }
  }
  return { contractStatusByStudent: new Map([...byStudent].map(([id, c]) => [id, c.status])), contractStatusByBranch };
}

function auditActionOf(w: AccrualWrite): string {
  if (w.kind === "create") return "payment.standalone_monthly_accrual";
  if (w.kind === "update" && w.reopened) return "payment.accrual_reopened";
  if (w.kind === "update" && w.patch.status === "voided") return "payment.accrual_suspended";
  return "payment.accrual_repriced";
}

export type AccrualSyncResult = {
  month: string;
  /** Yazılması gereken yükümlülükler (içinde bulunulan + gelecek ay). */
  planned: StandaloneAccrual[];
  /** Yeni yazılan + yeniden açılan satır. */
  created: number;
  suspended: number;
  repriced: number;
};

/**
 * Tahakkuk senkronu — gece işi (tüm kurum) ve sözleşme iptali (`studentId` + `restoreContractId`) AYNI yoldan.
 * Çağıran kurum kapsamını (ALS) kurmuş olmalı. `apply:false` yalnız planı döndürür. Yazımlar öğrenci başına
 * `applyAccrualOps` ile kilit altında, sözleşme durumu kilit içinde yeniden kontrol edilerek yapılır.
 */
export async function syncStandaloneAccruals(
  tenantId: string,
  opts: { apply: boolean; now?: Date; studentId?: string; restoreContractId?: string; actorUserId?: string }
): Promise<AccrualSyncResult> {
  const [store, contracts, { recordAuditLog }, { applyAccrualOps }] = await Promise.all([
    import("./store"),
    import("./contracts"),
    import("./audit/log"),
    import("./payments/accrual-rows"),
  ]);
  const actorUserId = opts.actorUserId ?? "cron";
  const month = toZonedYmd(opts.now ?? new Date(), DEFAULT_APP_TIMEZONE).slice(0, 7);
  const next = shiftMonth(month, 1);
  // DB egress: gece işi tek dilim (ödemeler sayfası), sözleşme iptali yalnız o öğrencinin dilimi.
  const data = opts.studentId ? await store.readStudentScope(opts.studentId) : await store.readPaymentsPageData();
  const rows = await contracts.listContractSummaryRows(tenantId, opts.studentId);
  const base = {
    students: data.students,
    payments: data.payments,
    ...contractStatusMaps(data.students, data.teachers, rows, contracts.currentContractSummaryByStudent(rows)),
    teachers: data.teachers,
    lessons: data.lessons,
  };
  const current = planStandaloneMonthlyAccruals({ ...base, month });
  const upcoming = planUpcomingAccrualSync({ ...base, month: next });
  const restore = opts.restoreContractId ? planContractCancelRestore(data.payments, opts.restoreContractId) : [];
  const planned = [...current, ...upcoming.create];
  const result: AccrualSyncResult = { month, planned, created: 0, suspended: 0, repriced: 0 };
  if (!opts.apply) return result;

  const multiBranchOf = (studentId: string) => {
    const st = data.students.find((x) => x.id === studentId);
    return st ? effectiveEnrollments(st, data.teachers).length > 1 : false;
  };
  const opsByStudent = new Map<string, AccrualOp[]>();
  const push = (studentId: string, op: AccrualOp) => opsByStudent.set(studentId, [...(opsByStudent.get(studentId) ?? []), op]);
  for (const id of upcoming.suspendIds) push(data.payments.find((p) => p.id === id)!.studentId, { kind: "suspend", paymentId: id });
  for (const r of upcoming.reprice) push(r.studentId, { kind: "reprice", paymentId: r.paymentId, amount: r.amount });
  for (const r of restore) push(r.studentId, { kind: "resume", paymentId: r.paymentId, amount: r.amount });
  for (const a of planned) {
    const st = data.students.find((x) => x.id === a.studentId);
    const multiBranch = multiBranchOf(a.studentId);
    let enrollmentId = a.enrollmentId && isPersistedEnrollmentId(a.enrollmentId) ? a.enrollmentId : undefined;
    if (st && multiBranch && a.enrollmentId && !enrollmentId) {
      // Kalıcı kaydı olmayan çok branşlı eski öğrenci: satır açık bağ taşısın diye branşlar kalıcı yapılır.
      const { ensurePersistedEnrollments, materializedEnrollmentId } = await import("./enrollment-links");
      const branch = effectiveEnrollments(st, data.teachers).find((x) => x.id === a.enrollmentId);
      await ensurePersistedEnrollments(tenantId, st, data.teachers);
      if (branch) enrollmentId = materializedEnrollmentId(st.id, branch.instrument);
    }
    push(a.studentId, { kind: "ensure", month: a.month, amount: a.amount, enrollmentId, includeUnlinked: !multiBranch });
  }

  // Sıralı: json store'da eşzamanlı yazım yarışmasın.
  for (const [studentId, ops] of opsByStudent) {
    const st = data.students.find((x) => x.id === studentId)!;
    const multiBranch = multiBranchOf(studentId);
    // Kilit içinde TAZE sözleşme satırlarıyla planlayıcının kuralı: yaşayan (güncel) sözleşme → açma yok.
    const gate: ContractGate = (fresh, enrollmentId) => {
      if (multiBranch) {
        const own = fresh.map((r) => ({ ...r, id: r.contractId }));
        const cur = selectCurrentContract(enrollmentId ? own.filter((r) => contractEnrollmentId(st, r, data.teachers) === enrollmentId) : own);
        return !!cur && !isTerminalContractStatus(cur.status);
      }
      const cur = contracts.currentContractSummaryByStudent(fresh).get(studentId);
      return !!cur && !isTerminalContractStatus(cur.status);
    };
    const writes = await applyAccrualOps(tenantId, studentId, ops, { actorUserId, gate, now: opts.now });
    for (const w of writes) {
      if (w.kind === "skip") continue;
      const action = auditActionOf(w);
      if (action === "payment.accrual_suspended") result.suspended++;
      else if (action === "payment.accrual_repriced") result.repriced++;
      else result.created++;
      const id = w.kind === "create" ? w.row.id : w.id;
      await recordAuditLog({
        tenantId, actorUserId, actorRole: "SYSTEM", action, entityType: "Payment", entityId: id, outcome: "success",
        meta: { studentId, ...(w.kind === "create" ? { month: installmentMonthKeys(w.row)[0], amount: w.row.amount, enrollmentId: w.row.enrollmentId } : { patch: w.patch }), ...(opts.restoreContractId ? { contractId: opts.restoreContractId } : {}) },
      });
    }
  }
  return result;
}

/** Gece işi (tüm kurum). */
export async function runStandaloneMonthlyAccrual(tenantId: string, opts: { apply: boolean; now?: Date }): Promise<AccrualSyncResult> {
  return syncStandaloneAccruals(tenantId, opts);
}
