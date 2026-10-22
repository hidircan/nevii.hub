/**
 * SÖZLEŞMESİZ kayıt ilk tahsilatlarına dönem etiketi (+ "takip eden ay" kırılımı) yazar.
 *
 * Neden: 2026-10-14 öncesi sözleşmesiz kayıt ilk tahsilatı dönem etiketi taşımıyordu. Etiketsiz satırın dönemi
 * `installmentMonthShares`'te VADEDEN okunur ve kayıt satırında vade = TAHSİLAT GÜNÜ'dür. Eylül sonunda alınan, dersleri
 * Ekim'de başlayan öğrencinin ödemesi takvimde Eylül'e düşüyor; gece tahakkuku Ekim'i "karşılanmamış" sanıp ikinci bir
 * `monthly_plan` borcu yazıyordu (2026-10-22: Arya U., Luna T., Denyse N.). Öğrenciyi silip yeniden oluşturmak, yeni
 * kaydın etiketli satır yazması yüzünden "düzeltiyordu".
 *
 * Etiket, kayıt ekranının kullandığı TEK kuraldan (`suggestFirstCollection` → `registrationFirstCollectionPeriods`)
 * üretilir: ilk dönem = ders başlangıç günü (branş → öğrenci ders başlangıcı → kayıt başlangıcı) ile ay sonu.
 * - Takip eden ay seçili satır: kırılım tutarları satırla BİREBİR tutmuyorsa dokunulmaz (eski kural).
 * - Dönem ayı tahsilat ayından FARKLIYSA satır başka aya taşınır; yalnız öğrencinin gerçek ilk dersi aynı aydaysa
 *   (kanıt). Ders yoksa / başka aydaysa BELİRSİZ, dokunulmaz.
 * - Taşınan dönem için gece tahakkukunun yazdığı, hiç tahsilat görmemiş `monthly_plan` satırı aynı ayı ikinci kez
 *   borçlandırır → İPTAL edilir (silinmez). Tahsilatı olan satır varsa öğrenci BELİRSİZ, dokunulmaz.
 *
 * Tutar / ödenen / tahsilat tarihi DEĞİŞMEZ (kasa aynı). Silinmiş öğrenci atlanır. Her yazım AuditLog'a düşer.
 * Tekrar çalıştırılabilir: yalnız etiketi boş satırlar seçilir, iptal yalnız hâlâ ödenmemişse yapılır.
 *
 * Kullanım (önce kuru çalıştırma; hedef DB'yi doğrulayın — production yalnız owner onayıyla):
 *   STORE_MODE=db DATABASE_URL=<hedef> npx tsx scripts/backfill-first-collection-periods.ts            # rapor
 *   STORE_MODE=db DATABASE_URL=<hedef> npx tsx scripts/backfill-first-collection-periods.ts --apply    # yazar
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { suggestFirstCollection } from "../src/lib/enrollment-form";
import { registrationFirstCollectionPeriods } from "../src/lib/contracts";
import { installmentMonthKeys } from "../src/lib/attendance-calendar-plan";
import { recordAuditLog } from "../src/lib/audit/log";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "../src/lib/timezone";
import { resolveFirstCollectionMergeThreshold } from "../src/lib/types";
import type { Prisma } from "@prisma/client";
import type { StudentTermType } from "../src/lib/types";

type Enr = { id: string; monthlyFee?: number; weeklyLessonCount?: number; startDate?: string; lessonStartDate?: string; endDate?: string };
const ymd = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);
const istanbulMonth = (d: Date) => toZonedYmd(d, DEFAULT_APP_TIMEZONE).slice(0, 7);

async function main() {
  if (process.env.STORE_MODE !== "db") throw new Error("Bu betik yalnızca STORE_MODE=db ile çalışır.");
  const apply = process.argv.includes("--apply");
  console.log(`== Kayıt ilk tahsilatı dönem etiketi — ${apply ? "APPLY (kalıcı yazım)" : "DRY-RUN (yalnızca rapor)"} ==\n`);

  const rows = await prisma.payment.findMany({
    where: { source: "registration_first_payment", contractId: null, installmentPeriodLabel: null },
    select: {
      id: true, tenantId: true, studentId: true, enrollmentId: true, amount: true, paidAmount: true, status: true, dueDate: true,
      autoSuggestedAmount: true, firstCollectionIncludesNextMonth: true,
    },
  });
  const students = await prisma.student.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.studentId))] } },
    select: {
      id: true, tenantId: true, name: true, deletedAt: true, monthlyFee: true, weeklyLessonCount: true, enrollmentStartDate: true,
      lessonStartDate: true, enrollmentEndDate: true, termType: true, enrollments: true,
    },
  });

  const relabel: string[] = [];
  const moved: string[] = [];
  const voided: string[] = [];
  const ambiguous: string[] = [];
  for (const r of rows) {
    const st = students.find((s) => s.id === r.studentId && s.tenantId === r.tenantId);
    const tag = `${r.id} öğrenci=${st?.name ?? r.studentId}`;
    if (!st) { ambiguous.push(`${tag} — öğrenci bulunamadı`); continue; }
    if (st.deletedAt) continue; // silinmiş öğrencinin geçmişi değiştirilmez
    if (r.status === "voided") continue;
    const merged = r.firstCollectionIncludesNextMonth === true;
    const enr = ((st.enrollments as unknown as Enr[] | null) ?? []).find((e) => e.id === r.enrollmentId);
    const fee = enr?.monthlyFee ?? st.monthlyFee;
    const s = suggestFirstCollection({
      monthlyFee: fee,
      weeklyLessonCount: enr?.weeklyLessonCount ?? st.weeklyLessonCount,
      lessonStartDate: enr?.lessonStartDate?.slice(0, 10) || ymd(st.lessonStartDate),
      enrollmentStartDate: enr?.startDate?.slice(0, 10) || ymd(st.enrollmentStartDate),
      enrollmentEndDate: enr?.endDate?.slice(0, 10) || ymd(st.enrollmentEndDate),
      fallbackToday: ymd(r.dueDate)!,
      term: (st.termType as StudentTermType | null) ?? "guz",
      overrides: [],
      includeNextMonth: merged,
      mergeThresholdLessons: resolveFirstCollectionMergeThreshold({}),
    });
    if (!s) { ambiguous.push(`${tag} — ücret/haftalık ders geçersiz, dönem hesaplanamadı`); continue; }
    if (merged) {
      // Kırılım tutar taşır: yalnız satır, kayıt anı önerisiyle birebir aynıysa yazılır.
      if (r.autoSuggestedAmount != null) { ambiguous.push(`${tag} — manuel tutar (öneri ${r.autoSuggestedAmount}, alınan ${r.amount})`); continue; }
      if (r.paidAmount !== r.amount) { ambiguous.push(`${tag} — ödenen ${r.paidAmount} ≠ tutar ${r.amount}`); continue; }
      if (s.suggestedAmount !== r.amount) { ambiguous.push(`${tag} — yeniden hesap ${s.suggestedAmount} ≠ alınan ${r.amount}`); continue; }
    }
    const fields = registrationFirstCollectionPeriods(s, fee);
    const fromMonth = istanbulMonth(r.dueDate);
    const toMonth = s.startDay.slice(0, 7);

    // Dönem ayı tahsilat ayından farklı → satır taşınıyor: gerçek ilk ders kanıtı + aynı aya çift borç kontrolü.
    let duplicates: { id: string }[] = [];
    if (toMonth !== fromMonth) {
      const branchScope = r.enrollmentId ? { OR: [{ enrollmentId: r.enrollmentId }, { enrollmentId: null }] } : {};
      const firstLesson = await prisma.lesson.findFirst({
        where: { tenantId: r.tenantId, studentId: r.studentId, status: { not: "cancelled" }, ...branchScope },
        orderBy: { startAt: "asc" },
        select: { startAt: true },
      });
      const lessonMonth = firstLesson ? istanbulMonth(firstLesson.startAt) : undefined;
      if (lessonMonth !== toMonth) {
        ambiguous.push(`${tag} — dönem ${fromMonth}→${toMonth} olmalı ama ilk ders ${lessonMonth ?? "yok"}; elle kontrol`);
        continue;
      }
      const plans = await prisma.payment.findMany({
        where: { tenantId: r.tenantId, studentId: r.studentId, source: "monthly_plan", contractId: null, status: { not: "voided" }, ...branchScope },
        select: { id: true, amount: true, paidAmount: true, status: true, dueDate: true, description: true, installmentPeriodLabel: true, source: true },
      });
      const sameMonth = plans.filter((p) =>
        installmentMonthKeys({ ...p, dueDate: p.dueDate.toISOString(), installmentPeriodLabel: p.installmentPeriodLabel ?? undefined }).includes(toMonth)
      );
      if (sameMonth.some((p) => p.paidAmount > 0)) {
        ambiguous.push(`${tag} — ${toMonth} için tahsilatı olan aylık plan satırı var (${sameMonth.map((p) => p.id).join(", ")}); elle kontrol`);
        continue;
      }
      duplicates = sameMonth;
    }

    if (toMonth !== fromMonth) moved.push(`${tag}: ${fromMonth} → "${fields.installmentPeriodLabel}"`);
    else relabel.push(`${tag}: "${fields.installmentPeriodLabel}"`);
    for (const d of duplicates) voided.push(`${d.id} (${st.name}, ${toMonth} gece tahakkuku — ilk tahsilat bu ayı karşılıyor)`);

    if (!apply) continue;
    await prisma.$transaction(async (tx) => {
      // Yalnız hâlâ etiketsizse yazar (eşzamanlı/ikinci çalıştırma güvenli); tutar alanlarına dokunmaz.
      await tx.payment.updateMany({
        where: { id: r.id, tenantId: r.tenantId, installmentPeriodLabel: null },
        data: {
          installmentPeriodLabel: fields.installmentPeriodLabel,
          ...(fields.installmentBreakdown ? { installmentBreakdown: fields.installmentBreakdown as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      for (const d of duplicates) {
        await tx.payment.updateMany({ where: { id: d.id, tenantId: r.tenantId, paidAmount: 0, status: { not: "voided" } }, data: { status: "voided" } });
      }
    });
    await recordAuditLog({
      tenantId: r.tenantId, actorUserId: "script", actorRole: "SYSTEM", action: "payment.first_collection_period_backfill",
      entityType: "Payment", entityId: r.id, outcome: "success",
      meta: { studentId: r.studentId, fromMonth, toMonth, label: fields.installmentPeriodLabel, voidedDuplicateAccruals: duplicates.map((d) => d.id) },
    });
    for (const d of duplicates) {
      await recordAuditLog({
        tenantId: r.tenantId, actorUserId: "script", actorRole: "SYSTEM", action: "payment.duplicate_accrual_voided",
        entityType: "Payment", entityId: d.id, outcome: "success",
        meta: { studentId: r.studentId, month: toMonth, coveredByPaymentId: r.id },
      });
    }
  }
  console.log(`Aday: ${rows.length} · taşınan: ${moved.length} · yalnız etiket: ${relabel.length} · iptal edilecek mükerrer tahakkuk: ${voided.length} · belirsiz: ${ambiguous.length}\n`);
  for (const m of moved) console.log(`TAŞI     ${m}`);
  for (const v of voided) console.log(`İPTAL    ${v}`);
  for (const l of relabel) console.log(`ETİKET   ${l}`);
  for (const a of ambiguous) console.log(`BELİRSİZ ${a}`);
  console.log(apply ? "\nYazıldı (etiket/kırılım + mükerrer tahakkuk iptali; AuditLog)." : "\nKuru çalıştırma — hiçbir şey yazılmadı.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
