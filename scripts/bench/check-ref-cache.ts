/**
 * DB egress — referans satır önbelleği kontrolü (2026-10-18). Her dilim için önbellek KAPALI / ıska / isabet
 * çıktılarının birebir aynı olduğunu, isabetin DB→uygulama baytını, tüketici mutasyonunun sızmadığını ve bir
 * öğrenci yazımının önbelleği geçersiz kıldığını gösterir.
 *
 *   scripts/bench/reseed-bench-db.sh && STORE_MODE=db DATABASE_URL=postgresql://$USER@127.0.0.1:5432/neviihub_egress_bench_p0 \
 *     npx tsx scripts/bench/check-ref-cache.ts
 *
 * Yalnız yerel tek kullanımlık DB (guard). Bir öğrencinin adını değiştirip geri alır.
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
  const run = <T>(f: () => Promise<T>) => runWithTenantAsync(TENANT, f);
  const measure = async <T>(f: () => Promise<T>) => {
    const before = bytes;
    const value = await run(f);
    return { value: JSON.stringify(value), kb: Math.round((bytes - before) / 1024) };
  };
  const from = new Date(Date.now() - 3 * 864e5).toISOString();
  const to = new Date(Date.now() + 7 * 864e5).toISOString();
  const slices: [string, () => Promise<unknown>][] = [
    ["reference", () => store.readReferenceData()],
    ["studentList", () => store.readStudentListData()],
    ["lessonWindow", () => store.readLessonWindow(from, to)],
    ["paymentsPage", () => store.readPaymentsPageData()],
  ];
  let ok = true;
  for (const [name, f] of slices) {
    process.env.NEVII_REF_CACHE = "0";
    const off = await measure(f);
    delete process.env.NEVII_REF_CACHE;
    const miss = await measure(f);
    const hit = await measure(f);
    const same = miss.value === off.value && hit.value === off.value;
    ok &&= same;
    console.log(`${name.padEnd(13)} aynı=${same} kapalı=${off.kb} KB ıska=${miss.kb} KB isabet=${hit.kb} KB`);
  }
  const a = await run(() => store.readReferenceData());
  a.students[0]!.name = "MUTATED";
  const b = await run(() => store.readReferenceData());
  const isolated = !b.students.some((s) => s.name === "MUTATED");
  const prisma = getPrisma();
  const s0 = (await prisma.student.findFirst({ where: { tenantId: TENANT } }))!;
  await prisma.student.update({ where: { id: s0.id }, data: { name: `${s0.name} X` } });
  const c = await run(() => store.readReferenceData());
  await prisma.student.update({ where: { id: s0.id }, data: { name: s0.name } });
  const invalidated = c.students.find((s) => s.id === s0.id)?.name === `${s0.name} X`;
  console.log(`mutasyon izole=${isolated} yazım geçersiz kıldı=${invalidated}`);
  if (!(ok && isolated && invalidated)) process.exit(1);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
