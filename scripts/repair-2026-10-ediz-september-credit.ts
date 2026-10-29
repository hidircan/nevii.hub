/**
 * TEK SEFERLİK VERİ ONARIMI (PR #94) — Ediz A. H. (tenant_nilufer_acar / stu_nnd8ru1u1dsw), Eylül 2026.
 *
 * Durum: v1 (contract_k1lggfvz7ltx) Eylül bedeli 7.950 TL, 01.09.2026'da tahsil edildi (pay_seqyaf3d1dwh, dönem
 * "19–30 Eylül 2026", tek dönem `first_collection`). Aynı gün yapılan iki revizyonda (v2, v3) ilk dönem ders
 * sayısından yeniden 3.975 TL hesaplandı ve v3 (contract_yl8q21y83ywy) bu tahsilatı hiç mahsup etmedi: v3 Eylül
 * plan satırı pay_148precr3yys 3.975 TL açık borç gösteriyor. Sahip doğrulaması (2026-10-25): Eylül bedeli 7.950,
 * tahsilatın tamamı Eylül'e ait, fazla ödeme / Ekim'e aktarım YOK.
 *
 * Model: revizyon mahsubunda tamamen kapanan dönem için Payment satırı YAZILMAZ (contracts.ts `createContract`:
 * `paymentRows = allocated.rows.filter((r) => r.amount > 0)`). Mevcut satırı bu duruma getirmenin silmesiz karşılığı,
 * başka bir tahsilatla zaten karşılanan ve tahsilat görmemiş borç satırını İPTAL etmektir (aynı desen:
 * scripts/backfill-first-collection-periods.ts `payment.duplicate_accrual_voided`). Bu satıra bağlı takip vakası yoktur
 * (2026-10-25 salt-okunur kontrol); varsa betik durmaz, vaka elle kapatılmalıdır. Tutar, tahsilat ve
 * tarih alanları değişmez; v1/v2 satırları, Ekim satırı ve sözleşme snapshot'ı DOKUNULMAZ. Satır silinmez.
 *
 * Otomatik çalışmaz: build/deploy/migration bu dosyayı çağırmaz (prisma/migrations altında değildir, package.json
 * script'i yoktur). Bağlantı bilgisi ortamdan okunur; dosyada sır yoktur.
 *
 * Kullanım (önce kuru çalıştırma; production yalnız sahibin bu betik için açık onayıyla):
 *   STORE_MODE=db DATABASE_URL=<hedef, oturum havuzu :5432> npx tsx scripts/repair-2026-10-ediz-september-credit.ts
 *   STORE_MODE=db DATABASE_URL=<...> npx tsx scripts/repair-2026-10-ediz-september-credit.ts --apply --approved-by=<User.id>
 * `--approved-by`: onayı veren GERÇEK kullanıcının User.id'si (aynı kurumda yönetici ya da platform sahibi) —
 * doğrulanır, uydurma kimlik kabul edilmez. İşlemi yürüten teknik aktör AuditLog'da `script`/`SYSTEM`'dir.
 * Tekrar çalıştırılabilir: satır zaten iptalse hiçbir şey yazmaz.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { recordAuditLog } from "../src/lib/audit/log";

const TENANT = "tenant_nilufer_acar";
const STUDENT = "stu_nnd8ru1u1dsw";
const V1 = { contractId: "contract_k1lggfvz7ltx", contractNumber: "NP-SEC-2026-AC03CE7B", paymentId: "pay_seqyaf3d1dwh" };
const V3 = { contractId: "contract_yl8q21y83ywy", septemberPaymentId: "pay_148precr3yys", octoberPaymentId: "pay_xm91vqj13yys" };
const NOTE =
  `Eylül 2026 dönemi ${V1.contractNumber} (v1) sürümünde 01.09.2026 tahsil edilen 7.950 TL ile karşılandı ` +
  `(dönem bedeli 7.950 TL). Revizyonda mahsup edilmediği için bu plan satırı ikinci borç olarak iptal edildi; tahsilat v1 satırındadır.`;
const ADMIN_ROLES = new Set(["SUPER_ADMIN", "SCHOOL_ADMIN", "HYPER_ADMIN"]);

async function main() {
  const apply = process.argv.includes("--apply");
  const approvedBy = process.argv.find((a) => a.startsWith("--approved-by="))?.slice("--approved-by=".length);

  const [v3, v1Paid, sept, oct] = await Promise.all([
    prisma.studentContract.findFirst({ where: { id: V3.contractId, tenantId: TENANT, studentId: STUDENT } }),
    prisma.payment.findFirst({ where: { id: V1.paymentId, tenantId: TENANT, studentId: STUDENT, contractId: V1.contractId } }),
    prisma.payment.findFirst({ where: { id: V3.septemberPaymentId, tenantId: TENANT, studentId: STUDENT, contractId: V3.contractId } }),
    prisma.payment.findFirst({ where: { id: V3.octoberPaymentId, tenantId: TENANT, studentId: STUDENT, contractId: V3.contractId } }),
  ]);
  if (!v3 || !v1Paid || !sept || !oct) throw new Error("Hedef kayıtlardan biri bulunamadı; hiçbir şey yazılmadı.");

  const show = (label: string, p: { id: string; amount: number; paidAmount: number; status: string }) =>
    console.log(`${label.padEnd(22)} ${p.id}  tutar ${p.amount}  ödenen ${p.paidAmount}  durum ${p.status}`);
  show("v1 gerçek tahsilat", v1Paid);
  show("v3 Eylül (onarılacak)", sept);
  show("v3 Ekim (değişmez)", oct);

  if (sept.status === "voided") {
    console.log("\nZaten onarılmış (v3 Eylül satırı iptal). Hiçbir şey yazılmadı.");
    return;
  }

  // Ön koşullar — biri tutmazsa durur.
  const problems: string[] = [];
  if (v3.status === "cancelled" || v3.status === "superseded") problems.push(`v3 güncel değil (durum ${v3.status})`);
  if (!(v1Paid.status === "paid" && v1Paid.paidAmount === 7950 && v1Paid.installmentPeriodLabel === "19–30 Eylül 2026"))
    problems.push("v1 Eylül tahsilatı beklenen durumda değil (ödendi 7.950, dönem 19–30 Eylül 2026)");
  if (!(sept.installmentSequence === 1 && sept.amount === 3975 && sept.paidAmount === 0))
    problems.push("v3 Eylül satırı beklenen durumda değil (1. taksit, 3.975, ödenen 0)");
  if (!(oct.amount === 7950 && oct.paidAmount === 0)) problems.push("v3 Ekim satırı beklenen durumda değil (7.950, ödenen 0)");
  if (problems.length > 0) throw new Error(`Ön koşul tutmadı; hiçbir şey yazılmadı:\n- ${problems.join("\n- ")}`);

  const openBefore = await openTotal();
  console.log(`\nv3 açık toplam: ${openBefore} → ${openBefore - sept.amount} (beklenen 75525 → 71550)`);
  console.log(`Not: ${NOTE}`);

  if (!apply) {
    console.log("\nKuru çalıştırma — hiçbir şey yazılmadı. Yazmak için --apply --approved-by=<User.id>.");
    return;
  }
  if (!approvedBy) throw new Error("--approved-by=<User.id> zorunlu (onayı veren gerçek kullanıcı).");
  const approver = await prisma.user.findFirst({ where: { id: approvedBy } });
  if (!approver || !ADMIN_ROLES.has(approver.role) || (approver.role !== "HYPER_ADMIN" && approver.tenantId !== TENANT)) {
    throw new Error(`Onaylayan kullanıcı doğrulanamadı (${approvedBy}): bu kurumda yönetici ya da platform sahibi olmalı.`);
  }

  // Koşullu yazım (backfill-first-collection-periods.ts ile aynı desen): yalnız satır hâlâ aynı tutarda, tahsilatsız ve
  // açıksa iptal edilir — arada tahsilat girildiyse 0 satır döner ve hiçbir şey yazılmaz. Tutar/tarih alanları değişmez.
  const { count } = await prisma.payment.updateMany({
    where: { id: sept.id, tenantId: TENANT, contractId: V3.contractId, amount: 3975, paidAmount: 0, status: { in: ["pending", "overdue"] } },
    data: { status: "voided", paymentNote: NOTE },
  });
  if (count !== 1) throw new Error("v3 Eylül satırı okuma ile yazma arasında değişti; hiçbir şey yazılmadı.");
  const after = await prisma.payment.findFirstOrThrow({ where: { id: sept.id, tenantId: TENANT } });
  const audit = await recordAuditLog({
    tenantId: TENANT,
    actorUserId: "script",
    actorRole: "SYSTEM",
    action: "payment.amendment_credit_repair_voided",
    entityType: "Payment",
    entityId: sept.id,
    outcome: "success",
    meta: {
      studentId: STUDENT,
      contractId: V3.contractId,
      month: "2026-09",
      periodPrice: 7950,
      coveredByPaymentId: V1.paymentId,
      coveredByContractId: V1.contractId,
      before: { amount: sept.amount, paidAmount: sept.paidAmount, status: sept.status },
      after: { amount: after.amount, paidAmount: after.paidAmount, status: after.status },
      approvedBy: approver.id,
      approvedByRole: approver.role,
      pr: "hidircan/nevii.hub#94",
    },
  });
  const openAfter = await openTotal();
  console.log(`\nYazıldı: ${sept.id} → ${after.status}. v3 açık toplam ${openAfter}. AuditLog ${audit.persisted ? audit.id : "YAZILAMADI — elle kontrol edin"}.`);
  if (openAfter !== 71550) console.error("UYARI: v3 açık toplamı beklenen 71550 değil; sonucu kontrol edin.");
}

async function openTotal(): Promise<number> {
  const rows = await prisma.payment.findMany({
    where: { tenantId: TENANT, contractId: V3.contractId, status: { not: "voided" } },
    select: { amount: true, paidAmount: true },
  });
  return rows.reduce((s, r) => s + Math.max(r.amount - r.paidAmount, 0), 0);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
