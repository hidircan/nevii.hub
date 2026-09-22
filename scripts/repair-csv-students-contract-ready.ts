/**
 * CSV ile gelmiş (veya eski) öğrencileri normal kayıtla AYNI sözleşme akışına
 * hazırlar — DRY RUN varsayılan, idempotent.
 *
 * Doldurulanlar (yalnız BOŞSA): derivedPerLessonAmount (aylık ücret ÷ haftalık×4),
 * accountResponsibility (veli telefonu varsa veli), monthlyFeeManualOverride=false.
 * Dokunulmayanlar: Payment, StudentContract, DocumentInstance, ilk tahsilat —
 * finansal geçmiş tahmin edilmez; eksik ilk tahsilat sözleşme adımında girilir.
 * displayId eksikse rapor edilir; atamak için `npx tsx scripts/backfill-display-ids.ts`.
 *
 *   npx tsx scripts/repair-csv-students-contract-ready.ts            # rapor (yazmaz)
 *   npx tsx scripts/repair-csv-students-contract-ready.ts --apply    # yaz
 *
 * DB modunda tüm tenant'lar taranır. Production'da ajan oturumu çalıştırmaz.
 */
import "dotenv/config";
import { isDbMode } from "../src/lib/config";
import { contractReadinessPatch, type ContractReadinessStudent } from "../src/lib/student-contract-readiness";

type Report = { tenantId: string; id: string; name: string; patch: Record<string, unknown>; missingDisplayId: boolean; hasFirstPayment: boolean };

function describe(r: Report): string {
  const parts = Object.entries(r.patch).map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  if (r.missingDisplayId) parts.push("displayId EKSİK (backfill-display-ids)");
  if (!r.hasFirstPayment) parts.push("ilk tahsilat yok → sözleşme adımında girilecek (uydurulmaz)");
  return `  ${r.tenantId} · ${r.name} (${r.id}): ${parts.join(", ")}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLY — boş alanlar yazılacak" : "DRY RUN — yazma yok");
  const reports: Report[] = [];

  if (isDbMode) {
    const { prisma } = await import("../src/lib/db");
    const students = await prisma.student.findMany({
      select: {
        id: true, tenantId: true, name: true, monthlyFee: true, weeklyLessonCount: true, parentPhone: true,
        derivedPerLessonAmount: true, accountResponsibility: true, monthlyFeeManualOverride: true, displayId: true,
      },
    });
    const firstPayments = new Set(
      (await prisma.payment.findMany({ where: { source: "registration_first_payment" }, select: { studentId: true } })).map((p) => p.studentId)
    );
    for (const s of students) {
      const patch = contractReadinessPatch(s as ContractReadinessStudent);
      if (Object.keys(patch).length === 0 && s.displayId) continue;
      reports.push({ tenantId: s.tenantId, id: s.id, name: s.name, patch, missingDisplayId: !s.displayId, hasFirstPayment: firstPayments.has(s.id) });
      if (apply && Object.keys(patch).length > 0) {
        // Yarış güvenliği: yalnız hâlâ boşsa yaz (where koşulu), dolu değer ezilmez.
        await prisma.student.updateMany({ where: { id: s.id, tenantId: s.tenantId }, data: patch });
      }
    }
    await prisma.$disconnect();
  } else {
    const { readData, writeData } = await import("../src/lib/store-json");
    const data = await readData();
    const firstPayments = new Set(data.payments.filter((p) => p.source === "registration_first_payment").map((p) => p.studentId));
    const students = data.students.map((s) => {
      const patch = contractReadinessPatch(s);
      if (Object.keys(patch).length === 0 && s.displayId) return s;
      reports.push({ tenantId: data.settings.tenantId, id: s.id, name: s.name, patch, missingDisplayId: !s.displayId, hasFirstPayment: firstPayments.has(s.id) });
      return apply ? { ...s, ...patch } : s;
    });
    if (apply) await writeData({ ...data, students });
  }

  console.log(`${reports.length} öğrenci ${apply ? "güncellendi/raporlandı" : "güncellenebilir"}:`);
  for (const r of reports) console.log(describe(r));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
