/**
 * DB egress — Ödemeler liste dilimi kontrolü (2026-10-19). `readPaymentsListData` çıktısının tam ödeme diliminin
 * liste kolonlarına indirgenmişiyle birebir aynı olduğunu ve DB→uygulama baytını (önbellek isabeti) gösterir.
 *
 *   STORE_MODE=db DATABASE_URL=postgresql://$USER@127.0.0.1:5432/neviihub_egress_bench_p0 \
 *     npx tsx scripts/bench/check-payments-list.ts
 *
 * Yalnız yerel tek kullanımlık DB (guard). Yazım yapmaz.
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
  const { toPaymentListRow } = await import("../../src/lib/reference-data");
  const { runWithTenantAsync } = await import("../../src/lib/tenant-context");
  const measure = async <T>(f: () => Promise<T>) => {
    await runWithTenantAsync(TENANT, f);
    const before = bytes;
    const value = await runWithTenantAsync(TENANT, f);
    return { value, kb: Math.round((bytes - before) / 1024) };
  };
  const full = await measure(() => store.readPaymentsPageData());
  const list = await measure(() => store.readPaymentsListData());
  const expected = { ...full.value, payments: full.value.payments.map(toPaymentListRow) };
  const same = JSON.stringify(expected) === JSON.stringify(list.value) && list.value.payments.length > 0;
  console.log(`ödemeListesi aynı=${same} satır ${list.value.payments.length} · ${full.kb} KB → ${list.kb} KB`);
  process.exit(same ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
