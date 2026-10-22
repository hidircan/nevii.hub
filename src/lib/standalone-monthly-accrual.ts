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
import { installmentMonthKeys, isMonthlyPlanRowForMonth } from "./attendance-calendar-plan";
import { shiftMonth } from "./payment-month-view";
import { isTerminalContractStatus } from "./contract-list-helpers";
import { effectiveEnrollments, enrollmentTerms, isPersistedEnrollmentId, paymentEnrollmentId } from "./student-enrollments";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "./timezone";
import type { Lesson, Payment, StudentRef, Teacher } from "./types";

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

/** Gelecek ayın GEÇİCİ tahakkuk satırı: sözleşmesiz, iptal edilmemiş, hiç tahsilat görmemiş `monthly_plan` (yalnız tahakkuk böyle yazar). */
function isProvisionalAccrual(p: Payment, month: string): boolean {
  return p.source === "monthly_plan" && !p.contractId && p.status !== "voided" && Math.trunc(p.paidAmount) === 0 && isMonthlyPlanRowForMonth(p, month);
}

/**
 * Saf: GELECEK ay için tahakkuk senkronu — aynı kural (`planStandaloneMonthlyAccruals`) geçici satırlar YOKMUŞ gibi
 * çalıştırılır; sonuçla eşleşen geçici satır kalır, eşleşmeyen iptal edilir, kalan
 * yükümlülükler yeni satır olur. Böylece "yaklaşan borç" ile "olması gereken borç" tek kuraldan gelir.
 */
export function planUpcomingAccrualSync(input: AccrualPlanInput): {
  create: StandaloneAccrual[];
  voidIds: string[];
} {
  const provisional = input.payments.filter((p) => isProvisionalAccrual(p, input.month));
  const ids = new Set(provisional.map((p) => p.id));
  const due = planStandaloneMonthlyAccruals({ ...input, payments: input.payments.filter((p) => !ids.has(p.id)) });
  const used = new Set<StandaloneAccrual>();
  const voidIds: string[] = [];
  for (const p of provisional) {
    const match = due.find(
      (a) => !used.has(a) && a.studentId === p.studentId && (!a.enrollmentId || !p.enrollmentId || a.enrollmentId === p.enrollmentId)
    );
    if (!match) {
      voidIds.push(p.id);
      continue;
    }
    used.add(match);
  }
  return { create: due.filter((a) => !used.has(a)), voidIds };
}

/** Tek kurum — çağıran kurum kapsamını (ALS) kurmuş olmalı. `apply:false` yalnız planı döndürür. */
export async function runStandaloneMonthlyAccrual(
  tenantId: string,
  opts: { apply: boolean; now?: Date }
): Promise<{ month: string; planned: StandaloneAccrual[]; created: number; voided: number }> {
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
  const base = {
    students: data.students,
    payments: data.payments,
    contractStatusByStudent: new Map([...summaries].map(([id, c]) => [id, c.status])),
    contractStatusByBranch,
    teachers: data.teachers,
    lessons: data.lessons,
  };
  // Aynı okuma iki ayı planlar (ek DB okuması yok): içinde bulunulan ay + gelecek ay (geçici, senkronlanır).
  const upcoming = planUpcomingAccrualSync({ ...base, month: shiftMonth(month, 1) });
  const planned = [...planStandaloneMonthlyAccruals({ ...base, month }), ...upcoming.create];
  let created = 0;
  let voided = 0;
  if (opts.apply) {
    const { collectPayment } = await import("./payments/collect");
    for (const id of upcoming.voidIds) {
      try {
        // Tek satır, yarış güvenli: arada tahsilat girildiyse (PAYMENT_CHANGED) satıra dokunulmaz.
        await collectPayment(id, { voided: true, onlyIfUntouchedOpenDebt: true, actorUserId: "cron", tenantId });
      } catch (e) {
        if (e instanceof Error && e.message === "PAYMENT_CHANGED") continue;
        throw e;
      }
      // ponytail: iptal satırı o ayı "karşılanmış" sayar (coversMonth, iptal dahil) — öğrenci ay başlamadan yeniden uygun
      // olursa (durdurma kalkar / sözleşme iptal) o ay otomatik tahakkuk edilmez; ihtiyaç doğarsa iptal nedeni işaretlenip
      // yalnız yönetici iptalleri karşılayıcı sayılır.
      voided++;
      await recordAuditLog({
        tenantId, actorUserId: "cron", actorRole: "SYSTEM", action: "payment.upcoming_accrual_voided",
        entityType: "Payment", entityId: id, outcome: "success", meta: { month: shiftMonth(month, 1) },
      });
    }
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
  return { month, planned, created, voided };
}
