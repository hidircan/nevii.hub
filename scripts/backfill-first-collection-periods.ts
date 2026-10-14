/**
 * 2026-10-14 — SÖZLEŞMESİZ "takip eden ayı da ekle" kayıt tahsilatlarına dönem etiketi + kırılımı yazar.
 *
 * Neden: 2026-10-14 öncesi sözleşmesiz kayıt ilk tahsilatı tek satırdı ve yalnız `firstCollectionIncludesNextMonth`
 * bayrağını taşıyordu (dönem etiketi/kırılımı yok). Kod düzeltmesinden sonra takvim o satırın kapsadığı ikinci ayı
 * "kayıt ilk tahsilatına dahil" diye gösterir ama ayın TUTARINI tahmin etmez. Bu betik kırılımı, kayıt anındaki
 * öneriyi (`suggestFirstCollection`) bugünkü kayıt koşullarıyla YENİDEN hesaplayıp satır tutarını BİREBİR veriyorsa
 * yazar; aksi her durumu "belirsiz" olarak raporlar ve dokunmaz.
 *
 * Yazılan alanlar YALNIZ `installmentPeriodLabel` + `installmentBreakdown`. `amount`, `paidAmount`, `paidAt`, `status`
 * DEĞİŞMEZ → toplam tahsilat ve kasa aynı kalır. Tekrar çalıştırılabilir: yalnız etiketi boş satırlar seçilir.
 *
 * Kullanım (önce kuru çalıştırma; hedef DB'yi doğrulayın — production yalnız owner onayıyla):
 *   STORE_MODE=db DATABASE_URL=<hedef> npx tsx scripts/backfill-first-collection-periods.ts            # rapor
 *   STORE_MODE=db DATABASE_URL=<hedef> npx tsx scripts/backfill-first-collection-periods.ts --apply    # yazar
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { suggestFirstCollection } from "../src/lib/enrollment-form";
import { registrationFirstCollectionPeriods } from "../src/lib/contracts";
import { resolveFirstCollectionMergeThreshold } from "../src/lib/types";
import type { Prisma } from "@prisma/client";
import type { StudentTermType } from "../src/lib/types";

type Enr = { id: string; monthlyFee?: number; weeklyLessonCount?: number; startDate?: string; lessonStartDate?: string; endDate?: string };
const ymd = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);

async function main() {
  if (process.env.STORE_MODE !== "db") throw new Error("Bu betik yalnızca STORE_MODE=db ile çalışır.");
  const apply = process.argv.includes("--apply");
  console.log(`== Kayıt ilk tahsilatı dönem kırılımı — ${apply ? "APPLY (kalıcı yazım)" : "DRY-RUN (yalnızca rapor)"} ==\n`);

  const rows = await prisma.payment.findMany({
    where: { source: "registration_first_payment", contractId: null, firstCollectionIncludesNextMonth: true, installmentPeriodLabel: null },
    select: { id: true, tenantId: true, studentId: true, enrollmentId: true, amount: true, paidAmount: true, status: true, dueDate: true, autoSuggestedAmount: true },
  });
  const students = await prisma.student.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.studentId))] } },
    select: { id: true, tenantId: true, monthlyFee: true, weeklyLessonCount: true, enrollmentStartDate: true, lessonStartDate: true, enrollmentEndDate: true, termType: true, enrollments: true },
  });

  const exact: { id: string; studentId: string; label: string }[] = [];
  const ambiguous: { id: string; studentId: string; reason: string }[] = [];
  for (const r of rows) {
    const st = students.find((s) => s.id === r.studentId && s.tenantId === r.tenantId);
    if (!st) { ambiguous.push({ id: r.id, studentId: r.studentId, reason: "öğrenci bulunamadı" }); continue; }
    if (r.status === "voided") { ambiguous.push({ id: r.id, studentId: r.studentId, reason: "satır iptal" }); continue; }
    if (r.autoSuggestedAmount != null) { ambiguous.push({ id: r.id, studentId: r.studentId, reason: `manuel tutar (öneri ${r.autoSuggestedAmount}, alınan ${r.amount})` }); continue; }
    if (r.paidAmount !== r.amount) { ambiguous.push({ id: r.id, studentId: r.studentId, reason: `ödenen ${r.paidAmount} ≠ tutar ${r.amount} (kısmi/geri alınmış)` }); continue; }
    const enr = ((st.enrollments as unknown as Enr[] | null) ?? []).find((e) => e.id === r.enrollmentId);
    const fee = enr?.monthlyFee ?? st.monthlyFee;
    const s = suggestFirstCollection({
      monthlyFee: fee,
      weeklyLessonCount: enr?.weeklyLessonCount ?? st.weeklyLessonCount,
      lessonStartDate: enr?.lessonStartDate ?? ymd(st.lessonStartDate),
      enrollmentStartDate: enr?.startDate ?? ymd(st.enrollmentStartDate),
      enrollmentEndDate: enr?.endDate ?? ymd(st.enrollmentEndDate),
      fallbackToday: ymd(r.dueDate)!,
      term: (st.termType as StudentTermType | null) ?? "guz",
      overrides: [],
      includeNextMonth: true,
      mergeThresholdLessons: resolveFirstCollectionMergeThreshold({}),
    });
    if (!s || s.suggestedAmount !== r.amount) {
      ambiguous.push({ id: r.id, studentId: r.studentId, reason: `yeniden hesap ${s?.suggestedAmount ?? "yok"} ≠ alınan ${r.amount} (ücret/ders sayısı değişmiş olabilir)` });
      continue;
    }
    const fields = registrationFirstCollectionPeriods(s, fee);
    exact.push({ id: r.id, studentId: r.studentId, label: fields.installmentPeriodLabel });
    if (apply) {
      // Yalnız hâlâ etiketsizse yazar (eşzamanlı/ikinci çalıştırma güvenli); tutar alanlarına dokunmaz.
      await prisma.payment.updateMany({
        where: { id: r.id, tenantId: r.tenantId, installmentPeriodLabel: null },
        data: { installmentPeriodLabel: fields.installmentPeriodLabel, installmentBreakdown: fields.installmentBreakdown as unknown as Prisma.InputJsonValue },
      });
    }
  }
  console.log(`Aday: ${rows.length} · kesin: ${exact.length} · belirsiz: ${ambiguous.length}\n`);
  for (const e of exact) console.log(`KESİN    ${e.id} öğrenci=${e.studentId} → "${e.label}"`);
  for (const a of ambiguous) console.log(`BELİRSİZ ${a.id} öğrenci=${a.studentId} — ${a.reason}`);
  console.log(apply ? "\nYazıldı (yalnız etiket + kırılım)." : "\nKuru çalıştırma — hiçbir şey yazılmadı.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
