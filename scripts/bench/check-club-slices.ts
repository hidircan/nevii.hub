/**
 * DB egress — kulüp dilimi kontrolü (2026-10-19). `clubOnly` ders penceresi / ödeme dilimi çıktısının, aynı dilimin
 * süzgeçsiz çıktısına aynı kural uygulanmışıyla birebir aynı olduğunu ve DB→uygulama baytını gösterir.
 *
 *   STORE_MODE=db DATABASE_URL=postgresql://$USER@127.0.0.1:5432/neviihub_egress_bench_p0 \
 *     npx tsx scripts/bench/check-club-slices.ts
 *
 * Yalnız yerel tek kullanımlık DB (guard). Bench verisinde kulüp yok: 60 dersi ve 12 ödemeyi geçici olarak kulüp
 * satırı yapar, sonunda geri alır.
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
  const store = await import("../../src/lib/store");
  const { runWithTenantAsync } = await import("../../src/lib/tenant-context");
  const { getPrisma } = await import("../../src/lib/db");
  const prisma = getPrisma();
  const run = <T>(f: () => Promise<T>) => runWithTenantAsync(TENANT, f);
  const measure = async <T>(f: () => Promise<T>) => {
    const before = bytes;
    const value = await run(f);
    return { value, kb: Math.round((bytes - before) / 1024) };
  };

  const lessonIds = (await prisma.lesson.findMany({ where: { tenantId: TENANT }, select: { id: true }, take: 60 })).map((l) => l.id);
  const paymentIds = (await prisma.payment.findMany({ where: { tenantId: TENANT }, select: { id: true }, take: 12 })).map((p) => p.id);
  const sources = await prisma.payment.findMany({ where: { id: { in: paymentIds } }, select: { id: true, source: true } });
  await prisma.lesson.updateMany({ where: { id: { in: lessonIds.slice(0, 30) } }, data: { clubId: "bench_club", clubSessionId: "bench_cses" } });
  await prisma.lesson.updateMany({ where: { id: { in: lessonIds.slice(30) } }, data: { clubId: "bench_club" } });
  await prisma.payment.updateMany({ where: { id: { in: paymentIds } }, data: { source: "club" } });
  let ok = true;
  try {
    const from = new Date(Date.now() - 120 * 864e5).toISOString();
    const to = new Date(Date.now() + 200 * 864e5).toISOString();
    const fullWin = await measure(() => store.readLessonWindow(from, to));
    const clubWin = await measure(() => store.readLessonWindow(from, to, { clubOnly: true }));
    const expectWin = { ...fullWin.value, lessons: fullWin.value.lessons.filter((l) => l.clubId || l.clubSessionId) };
    const winSame = JSON.stringify(clubWin.value) === JSON.stringify(expectWin) && clubWin.value.lessons.length > 0;
    const fullPay = await measure(() => store.readPaymentsPageData());
    const clubPay = await measure(() => store.readPaymentsPageData({ clubOnly: true }));
    const payments = fullPay.value.payments.filter((p) => p.source === "club");
    const linked = new Set(payments.map((p) => p.lessonId).filter(Boolean));
    const expectPay = { ...fullPay.value, payments, lessons: fullPay.value.lessons.filter((l) => linked.has(l.id)) };
    const paySame = JSON.stringify(clubPay.value) === JSON.stringify(expectPay) && payments.length === paymentIds.length;
    ok = winSame && paySame;
    console.log(`dersPenceresi aynı=${winSame} satır ${fullWin.value.lessons.length}→${clubWin.value.lessons.length} · ${fullWin.kb} KB → ${clubWin.kb} KB`);
    console.log(`ödemeDilimi  aynı=${paySame} satır ${fullPay.value.payments.length}→${clubPay.value.payments.length} · ${fullPay.kb} KB → ${clubPay.kb} KB`);
  } finally {
    await prisma.lesson.updateMany({ where: { id: { in: lessonIds } }, data: { clubId: null, clubSessionId: null } });
    for (const p of sources) await prisma.payment.update({ where: { id: p.id }, data: { source: p.source } });
  }
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
