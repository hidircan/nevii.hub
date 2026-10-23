/**
 * Bayat hakediş politikası — ETKİ ANALİZİ (salt-okunur, yazım YOK).
 *
 * Ne çıkarır:
 *  1) Tüm hakediş politikası dönemleri (ay, politika, tutarlar, setAt).
 *  2) Güncel ayda öğretmen başına çözümlenmiş politika + kaynak (explicit/inherited/default).
 *  3) Donmuş istisna rozeti taşıyan hakediş kayıtları (lineSnapshot issue'ları),
 *     durum sınıflamasıyla: pending (politika-düzeltmede otomatik recalc) /
 *     paid-partial (yalnız düzeltme kaydı) / cancelled (dahil değil).
 *  4) Ücret kuralı olmayan ama sabit-ücret ayında olan öğretmenler (eski yanlış-uyarı kapsamı).
 *
 * Kullanım (önce hedef DB'yi doğrulayın — production yalnız owner onayıyla):
 *   STORE_MODE=db npx tsx scripts/payout-stale-policy-report.ts
 *   STORE_MODE=db npx tsx scripts/payout-stale-policy-report.ts --tenant <id>
 *   STORE_MODE=db npx tsx scripts/payout-stale-policy-report.ts --tenant <id> --report out.json
 *
 * Bu betikte --apply YOKTUR: hiçbir satır yazılmaz, silinmez, güncellenmez.
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { prisma } from "../src/lib/db";

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type PolicyRow = { month: string; policy: string; rate30: number | null; rate40: number | null; rate50: number | null; setAt: Date };

function resolveMonth(policies: PolicyRow[], month: string): { policy: string; source: string; fromMonth?: string } {
  const exact = policies.find((p) => p.month === month);
  if (exact) return { policy: exact.policy, source: "explicit" };
  const prior = policies
    .filter((p) => p.month < month)
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  if (prior) return { policy: prior.policy, source: "inherited", fromMonth: prior.month };
  return { policy: "per_teacher_rule", source: "default" };
}

async function main() {
  if (process.env.STORE_MODE !== "db") {
    throw new Error("Bu betik yalnızca STORE_MODE=db ile çalışır.");
  }
  const onlyTenant = argValue("--tenant");
  const reportPath = argValue("--report");
  console.log("== Bayat hakediş politikası etki raporu — DRY-RUN (salt-okunur, yazım yok) ==\n");

  const tenants = onlyTenant
    ? [onlyTenant]
    : (await prisma.teacherPayout.findMany({ distinct: ["tenantId"], select: { tenantId: true } })).map((t) => t.tenantId);
  const nowMonth = new Date().toISOString().slice(0, 7);
  const out: unknown[] = [];

  for (const tenantId of tenants) {
    const [policies, payouts, teachers, feeRules] = await Promise.all([
      prisma.teacherPayoutPolicyPeriod.findMany({ where: { tenantId }, orderBy: { month: "asc" } }),
      prisma.teacherPayout.findMany({
        where: { tenantId },
        select: { id: true, teacherId: true, periodStart: true, periodEnd: true, status: true, pricingPolicy: true, pricingSnapshot: true, lineSnapshot: true },
      }),
      prisma.teacher.findMany({ where: { tenantId }, select: { id: true, name: true, active: true } }),
      prisma.teacherFeeRule.findMany({ where: { tenantId }, select: { teacherId: true } }),
    ]);
    const teacherName = new Map(teachers.map((t) => [t.id, t.name]));
    const withFee = new Set(feeRules.map((r) => r.teacherId));

    const flagged = payouts
      .filter((p) => p.status !== "cancelled" && Array.isArray(p.lineSnapshot))
      .map((p) => {
        const lines = p.lineSnapshot as Array<{ lessonId: string; issue?: string }>;
        const exceptions = lines.filter((l) => l.issue === "duration-exception").map((l) => l.lessonId);
        const missingRule = lines.filter((l) => l.issue === "missing-fee-rule").map((l) => l.lessonId);
        return { p, exceptions, missingRule };
      })
      .filter((x) => x.exceptions.length > 0 || x.missingRule.length > 0);

    const pending = flagged.filter((x) => x.p.status === "pending");
    const paidLike = flagged.filter((x) => x.p.status !== "pending");

    const currentResolution = teachers
      .filter((t) => t.active)
      .map((t) => ({ teacherId: t.id, teacherName: t.name, hasFeeRule: withFee.has(t.id), ...resolveMonth(policies, nowMonth) }));
    const staleWarningScope = currentResolution.filter((r) => !r.hasFeeRule && r.policy === "fixed_duration");

    const tenantReport = {
      tenantId,
      policies: policies.map((p) => ({ month: p.month, policy: p.policy, rate30: p.rate30, rate40: p.rate40, rate50: p.rate50, setAt: p.setAt })),
      currentMonth: nowMonth,
      currentResolution,
      flaggedPayouts: flagged.map((x) => ({
        payoutId: x.p.id,
        teacherName: teacherName.get(x.p.teacherId) ?? x.p.teacherId,
        period: `${x.p.periodStart.toISOString().slice(0, 10)}..${x.p.periodEnd.toISOString().slice(0, 10)}`,
        status: x.p.status,
        frozenPricing: x.p.pricingPolicy,
        durationExceptions: x.exceptions.length,
        missingFeeRule: x.missingRule.length,
        fixPath: x.p.status === "pending" ? "otomatik-recalc (politika-düzeltmede)" : "düzeltme-kaydı (kayıt yeniden yazılmaz)",
      })),
      summary: {
        flaggedTotal: flagged.length,
        pendingAutoFix: pending.length,
        paidNeedsAdjustment: paidLike.length,
        staleWarningTeachers: staleWarningScope.map((r) => r.teacherName),
        rescheduleNeeded: 0,
      },
    };
    out.push(tenantReport);

    console.log(`--- tenant ${tenantId} ---`);
    console.log(`Politika dönemleri (${policies.length}): ${policies.map((p) => `${p.month}=${p.policy}`).join(", ") || "yok (tamamı varsayılan)"}`);
    console.log(`Rozetli kayıt: ${flagged.length} (bekleyen/otomatik: ${pending.length}, ödemeli/düzeltme: ${paidLike.length})`);
    for (const f of tenantReport.flaggedPayouts) {
      console.log(`  - ${f.teacherName} ${f.period} [${f.status}] istisna=${f.durationExceptions} kural-eksik=${f.missingFeeRule} → ${f.fixPath}`);
    }
    console.log(`Yanlış-uyarı kapsamı (kural yok + sabit ay): ${tenantReport.summary.staleWarningTeachers.join(", ") || "yok"}`);
    console.log(`Yeniden planlama gereken ders: 0 (kodda recalc yeterli; ders taşıma kayda dokunmaz)\n`);
  }

  if (reportPath) {
    writeFileSync(reportPath, JSON.stringify(out, null, 2));
    console.log(`Rapor yazıldı: ${reportPath}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
