/**
 * Sözleşmeli öğrencide ikinci borç: hiç tahsilat görmemiş `monthly_plan` satırını listeler.
 *
 * Yaşayan sözleşme taksidi aynı dönemi kapsıyorsa satır açık borç değildir. Bu betik YAZMAZ.
 * `--apply` reddedilir. Production adresine bağlamadan önce hedefi doğrulayın.
 *
 *   DATABASE_URL=<hedef> npx tsx scripts/detect-superseded-monthly-plans.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { supersededUncollectedMonthlyPlanIds, type PlanLinkRow } from "../src/lib/superseded-monthly-plan";

function breakdownShares(raw: unknown): { periodLabel: string; amount: number }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows = raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const periodLabel = (item as { periodLabel?: unknown }).periodLabel;
    const amount = (item as { amount?: unknown }).amount;
    return typeof periodLabel === "string" && typeof amount === "number" ? [{ periodLabel, amount }] : [];
  });
  return rows.length > 0 ? rows : undefined;
}

async function main() {
  if (process.argv.includes("--apply")) {
    console.error("Bu betik yazmaz. --apply kabul edilmez.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL gerekli. Production adresini bu oturumda kullanmayın.");
  }
  const terminal = await prisma.studentContract.findMany({
    where: { status: { in: ["cancelled", "superseded"] } },
    select: { id: true, tenantId: true },
  });
  const rows = await prisma.payment.findMany({
    where: {
      status: { not: "voided" },
      OR: [
        { source: "monthly_plan", contractId: null, paidAmount: 0, status: { notIn: ["paid", "voided"] } },
        { contractId: { not: null } },
      ],
    },
    select: {
      id: true,
      tenantId: true,
      studentId: true,
      source: true,
      contractId: true,
      status: true,
      amount: true,
      paidAmount: true,
      dueDate: true,
      description: true,
      installmentPeriodLabel: true,
      installmentBreakdown: true,
      firstCollectionIncludesNextMonth: true,
      enrollmentId: true,
    },
  });
  const byTenant = new Map<string, PlanLinkRow[]>();
  for (const p of rows) {
    const link: PlanLinkRow = {
      id: p.id,
      studentId: p.studentId,
      source: p.source,
      contractId: p.contractId ?? undefined,
      status: p.status,
      amount: p.amount,
      paidAmount: p.paidAmount,
      dueDate: p.dueDate.toISOString(),
      description: p.description,
      installmentPeriodLabel: p.installmentPeriodLabel ?? undefined,
      installmentBreakdown: breakdownShares(p.installmentBreakdown),
      firstCollectionIncludesNextMonth: p.firstCollectionIncludesNextMonth ?? undefined,
      enrollmentId: p.enrollmentId ?? undefined,
    };
    const list = byTenant.get(p.tenantId);
    if (list) list.push(link);
    else byTenant.set(p.tenantId, [link]);
  }
  let count = 0;
  for (const [tenantId, links] of byTenant) {
    const terminalIds = new Set(terminal.filter((c) => c.tenantId === tenantId).map((c) => c.id));
    const drop = supersededUncollectedMonthlyPlanIds(links, terminalIds);
    for (const id of drop) {
      const row = rows.find((p) => p.id === id && p.tenantId === tenantId);
      if (!row) continue;
      count++;
      console.log(
        JSON.stringify({
          tenantId,
          studentId: row.studentId,
          paymentId: row.id,
          amount: row.amount,
          paidAmount: row.paidAmount,
          dueDate: row.dueDate.toISOString(),
          description: row.description,
          enrollmentId: row.enrollmentId,
        })
      );
    }
  }
  console.log(`aday=${count} yazım=yok`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "tarama başarısız");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
