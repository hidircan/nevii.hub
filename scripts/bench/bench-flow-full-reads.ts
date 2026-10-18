/**
 * DB egress — UÇTAN UCA akış sayacı (2026-10-18). Okuyucu bench'leri yalnız okuyucuyu ölçer; bu betik GERÇEK
 * tool'u çağırır ve akış boyunca `store-db.readData()` tam okuma sayısını (`egress:readData:full` satırı) ve
 * DB→uygulama baytını sayar — yazım sonrası kanca/sondaki okuma gibi akışın derinindeki tam okumaları yakalar.
 *
 *   scripts/bench/reseed-bench-db.sh && STORE_MODE=db DATABASE_URL=postgresql://$USER@127.0.0.1:5432/neviihub_egress_bench_p0 \
 *     npx tsx scripts/bench/bench-flow-full-reads.ts          # "önce": betiği taban worktree'ye kopyalayıp orada koş
 *
 * Yalnız yerel tek kullanımlık DB (guard). YAZMA yapar — her koşudan önce yeniden tohumlayın. Yeni akış = bir satır.
 */
import { createRequire } from "node:module";
import { assertDisposableLocalTarget } from "./seed-egress-bench";

async function main() {
  const TENANT = "tenant_nilufer_acar";
  assertDisposableLocalTarget(process.env.DATABASE_URL);
  if (process.env.STORE_MODE !== "db") throw new Error("STORE_MODE=db");
  let bytes = 0;
  const pg = createRequire(`${process.cwd()}/`)("pg");
  const attach = pg.Connection.prototype.attachListeners;
  pg.Connection.prototype.attachListeners = function (stream: NodeJS.ReadableStream) {
    stream.on("data", (b: Buffer) => (bytes += b.length));
    return attach.call(this, stream);
  };
  let full = 0;
  const oi = console.info;
  console.info = (...a: unknown[]) => {
    if (a.some((x) => String(x).startsWith("egress:readData:full"))) full++;
  };
  console.warn = () => {};
  const tools = await import("../../src/lib/services/tools");
  const mobile = await import("../../src/lib/services/mobile-read");
  const accrual = await import("../../src/lib/standalone-monthly-accrual");
  const db = await import("../../src/lib/store-db");
  const store = await import("../../src/lib/store");
  const { runWithTenantAsync } = await import("../../src/lib/tenant-context");
  const ctx = { role: "SUPER_ADMIN" as const, userId: "user_owner_nilufer", tenantId: TENANT, channel: "web" as const };

  await runWithTenantAsync(TENANT, async () => {
    const F = await db.readData();
    const T = F.teachers[0]!;
    const open = F.makeupRequests.find((m) => ["pending", "suggested"].includes(m.status) && (!m.expiresAt || m.expiresAt > "2026-12-31"))
      ?? F.makeupRequests.find((m) => ["pending", "suggested"].includes(m.status));
    if (open && open.expiresAt && open.expiresAt < "2026-12-31") {
      const { prisma } = await import("../../src/lib/db");
      await prisma.makeupRequest.update({ where: { id: open.id }, data: { expiresAt: new Date("2027-01-31T00:00:00Z") } });
    }
    const movable = F.lessons.filter((l) => l.status === "scheduled" && l.startAt > "2026-10-25" && !l.makeupRequestId && [2, 3, 4, 5].includes(new Date(l.startAt).getUTCDay())).slice(0, 30);
    const stu = F.students.find((s) => !s.deletedAt)!;
    const room =
      F.rooms.find((r) => open && r.branchId === open.branchId && r.instruments.includes(open.instrument as never)) ??
      F.rooms.find((r) => open && r.instruments.includes(open.instrument as never)) ??
      F.rooms[0]!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flows: [string, () => Promise<any>][] = [
      ["Ders taşı (Program sürükle)", async () => {
        let last = "";
        for (const c of movable) {
          full = 0; bytes = 0;
          const r = await tools.updateLessonScheduleTool(ctx, { lessonId: c.id, startAt: c.startAt.slice(0, 10) + "T" + "11:05" });
          if (r.ok) return r;
          last = (r as { error?: { message?: string } }).error?.message ?? "";
        }
        return { ok: false, message: "taşınamadı: " + last };
      }],
      ...(open
        ? ([["Telafi onayla", () => tools.confirmMakeupLessonTool(ctx, { requestId: open.id, slot: { startAt: "2026-12-08T07:00:00.000Z", endAt: "2026-12-08T07:40:00.000Z", teacherId: open.teacherId, roomId: room.id, branchId: room.branchId, score: 1, reasons: [] }, overrideAvailability: true })]] as [string, () => Promise<unknown>][])
        : []),
      ["Mobil telafi listesi", () => mobile.listMakeupRequestsTool(ctx)],
      ["Mobil görevler", () => tools.listTasksTool(ctx, {})],
      ["Mobil bildirimler", () => tools.listNotificationsTool(ctx, {})],
      ["Hakediş ekranı (öğretmen × ay)", () => tools.computeTeacherPayoutTool(ctx, { teacherId: T.id, periodStart: "2026-10-01", periodEnd: "2026-10-31" })],
      ["Finans özeti", () => tools.getFinanceSummaryTool(ctx, {})],
      ["Aylık plan satırı yaz (tahakkuk/tahsilat, öğrenci başına)", () => store.upsertMonthlyPlanPayment({ studentId: stu.id, month: "2027-03", amount: 1000 })],
      ["Aylık tahakkuk cron (1 Kasım)", () => accrual.runStandaloneMonthlyAccrual(TENANT, { apply: true, now: new Date("2026-11-01T02:00:00Z") })],
    ];
    oi(`| Akış | Tam okuma | DB→uygulama | Sonuç |\n|---|---:|---:|---|`);
    for (const [name, fn] of flows) {
      full = 0;
      bytes = 0;
      let res: unknown;
      try {
        res = await fn();
      } catch (e) {
        res = { ok: false, message: String(e) };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = res as any;
      const status = r?.ok === false ? `fail: ${String(r.message ?? r.error?.message ?? "").slice(0, 60)}` : r?.created !== undefined ? `created=${r.created}` : "ok";
      oi(`| ${name} | ${full} | ${(bytes / 1024).toFixed(0)} KB | ${status} |`);
    }
  });
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
