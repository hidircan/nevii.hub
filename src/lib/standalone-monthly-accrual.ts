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
import { effectiveEnrollments, enrollmentTerms, isPersistedEnrollmentId, paymentEnrollmentId } from "./student-enrollments";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "./timezone";
import type { Lesson, Payment, Student, Teacher } from "./types";

/**
 * 2026-10-09 — ÇOK BRANŞ: tahakkuk BRANŞ başınadır — her aktif branş kendi aylık ücreti, kayıt/bitiş tarihi ve kendi
 * güncel sözleşmesiyle değerlendirilir; bir branşın sözleşmesi/ödemesi diğerini "karşılamaz". Tek branşlı (ve branş
 * kaydı olmayan eski) öğrencide davranış birebir eskisidir. `enrollmentId` yazılacak satırın branşıdır.
 */
export type StandaloneAccrual = { studentId: string; month: string; amount: number; enrollmentId?: string };

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
  // 2026-10-14 — "takip eden ayı da ekle" kapsamı TEK kuraldan (`installmentMonthShares`): takvim ve döküm de aynı
  // fonksiyonu okur. Eskiden burada vade (tahsilat) ayı + 1 ayrıca hesaplanıyordu; takvim bu bayrağı hiç okumadığı
  // için sözleşmesiz öğrencide sonraki ay tahakkuk edilmiyor ama takvimde "ödeme kaydı yok" görünüyordu.
  return installmentMonthKeys(p).includes(month);
}

/** Saf: verilen ay için yazılması gereken sözleşmesiz aylık plan satırları. */
export function planStandaloneMonthlyAccruals(input: {
  students: Student[];
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

/** Tek kurum — çağıran kurum kapsamını (ALS) kurmuş olmalı. `apply:false` yalnız planı döndürür. */
export async function runStandaloneMonthlyAccrual(
  tenantId: string,
  opts: { apply: boolean; now?: Date }
): Promise<{ month: string; planned: StandaloneAccrual[]; created: number }> {
  const [{ readPaymentsPageData, upsertMonthlyPlanPayment }, { listContractSummariesByStudent, listContractSummaryRows }, { recordAuditLog }] =
    await Promise.all([import("./store"), import("./contracts"), import("./audit/log")]);
  const { selectCurrentContract } = await import("./contract-list-helpers");
  const { contractEnrollmentId } = await import("./student-enrollments");
  const month = toZonedYmd(opts.now ?? new Date(), DEFAULT_APP_TIMEZONE).slice(0, 7);
  const data = await readPaymentsPageData();
  const summaries = await listContractSummariesByStudent(tenantId);
  // Çok branşlı öğrencide güncel sözleşme branş başına (açık bağ; tek branşlıda o branş) — `selectCurrentContract`.
  const rows = await listContractSummaryRows(tenantId);
  const contractStatusByBranch = new Map<string, string>();
  for (const st of data.students) {
    const branches = effectiveEnrollments(st, data.teachers);
    if (branches.length < 2) continue;
    const own = rows.filter((r) => r.studentId === st.id).map((r) => ({ ...r, id: r.contractId }));
    for (const e of branches) {
      const current = selectCurrentContract(own.filter((r) => contractEnrollmentId(st, r, data.teachers) === e.id));
      if (current) contractStatusByBranch.set(`${st.id}:${e.id}`, current.status);
    }
  }
  const planned = planStandaloneMonthlyAccruals({
    students: data.students,
    payments: data.payments,
    contractStatusByStudent: new Map([...summaries].map(([id, c]) => [id, c.status])),
    contractStatusByBranch,
    teachers: data.teachers,
    lessons: data.lessons,
    month,
  });
  let created = 0;
  if (opts.apply) {
    // Sıralı: json store'da eşzamanlı yazım yarışmasın.
    for (const a of planned) {
      const st = data.students.find((x) => x.id === a.studentId);
      const multiBranch = st ? effectiveEnrollments(st, data.teachers).length > 1 : false;
      let enrollmentId = a.enrollmentId && isPersistedEnrollmentId(a.enrollmentId) ? a.enrollmentId : undefined;
      if (st && multiBranch && a.enrollmentId && !enrollmentId) {
        // Kalıcı kaydı olmayan çok branşlı eski öğrenci: satır açık bağ taşısın diye branşlar kalıcı yapılır.
        const { ensurePersistedEnrollments, materializedEnrollmentId } = await import("./enrollment-links");
        const branch = effectiveEnrollments(st, data.teachers).find((x) => x.id === a.enrollmentId);
        await ensurePersistedEnrollments(tenantId, st, data.teachers);
        if (branch) enrollmentId = materializedEnrollmentId(st.id, branch.instrument);
      }
      const { paymentId } = await upsertMonthlyPlanPayment({
        studentId: a.studentId,
        month: a.month,
        amount: a.amount,
        enrollmentId,
        includeUnlinked: !multiBranch,
      });
      created++;
      await recordAuditLog({
        tenantId,
        actorUserId: "cron",
        actorRole: "SYSTEM",
        action: "payment.standalone_monthly_accrual",
        entityType: "Payment",
        entityId: paymentId,
        outcome: "success",
        meta: { studentId: a.studentId, month: a.month, amount: a.amount, enrollmentId },
      });
    }
  }
  return { month, planned, created };
}
