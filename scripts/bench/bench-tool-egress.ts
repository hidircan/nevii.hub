/**
 * DB egress bench'i — TOOL/MUTASYON yolları (sayfa değil): yoklama işaretle/geri al, ders başlat/bitir,
 * müsaitlik kartı, ders oluştur, tahsilat, oturum refresh/presence. Tool'lar süreç İÇİNDE, gerçek
 * PostgreSQL (STORE_MODE=db) ile çağrılır; `pg` soketinden GELEN bayt (DB → uygulama) ve sorgu sayısı
 * senaryo başına sayılır. Önce/sonra aynı script iki worktree'de, aynı sentetik veriyle çalışır.
 *
 *   STORE_MODE=db DATABASE_URL=postgresql://<user>@127.0.0.1:5432/<bench db> \
 *     npx tsx scripts/bench/bench-tool-egress.ts --label before|after [--out <dir>]
 *
 * Yalnız yerel tek kullanımlık DB (guard). YAZMA yapar (yoklama/ders/tahsilat) — her koşudan önce
 * seed-egress-bench.ts ile yeniden tohumlayın. Çıktı yalnız sayısal toplamlar (kişisel veri yok).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { assertDisposableLocalTarget } from "./seed-egress-bench";

const TENANT = "tenant_nilufer_acar";

type Counters = {
  queries: number;
  bytesIn: number;
  begins: number;
  /** UserSession'a giden UPDATE ifadesi sayısı (koşul tutmasa da). */
  sessionUpdates: number;
  /** Gerçekten yazılan UserSession satırı (rowCount toplamı). */
  sessionRowsWritten: number;
  byTable: Record<string, number>;
};
const counters: Counters = { queries: 0, bytesIn: 0, begins: 0, sessionUpdates: 0, sessionRowsWritten: 0, byTable: {} };

/** pg-meter.mjs ile aynı yöntem; süreç içi (Prisma adapter'ının kullandığı AYNI `pg` örneği). */
function patchPg() {
  const pg = createRequire(`${process.cwd()}/`)("pg");
  const tableOf = (text: unknown) => {
    if (typeof text !== "string") return "(boşta)";
    const m = text.match(/FROM "public"\."(\w+)"/) || text.match(/^\s*(INSERT INTO|UPDATE|DELETE FROM) "public"\."(\w+)"/);
    if (!m) return "(diğer)";
    return m[2] ? `${m[2]} (yazma)` : m[1]!;
  };
  const originalQuery = pg.Client.prototype.query;
  pg.Client.prototype.query = function meteredQuery(this: { connection?: { __client?: unknown } }, ...args: unknown[]) {
    counters.queries += 1;
    const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string } | undefined)?.text;
    if (text && /^\s*BEGIN/i.test(text)) counters.begins += 1;
    const sessionUpdate = Boolean(text && /^\s*UPDATE "public"\."UserSession"/.test(text));
    if (sessionUpdate) counters.sessionUpdates += 1;
    if (this.connection) this.connection.__client = this;
    // Havuz (`pool.query`) callback biçimini kullanır — yazılan satır sayısı callback'ten de okunur.
    const last = args[args.length - 1];
    if (sessionUpdate && typeof last === "function") {
      args[args.length - 1] = (err: unknown, res?: { rowCount?: number }) => {
        if (!err) counters.sessionRowsWritten += res?.rowCount ?? 0;
        return (last as (e: unknown, r?: unknown) => unknown)(err, res);
      };
    }
    const out = originalQuery.apply(this, args);
    if (sessionUpdate && out && typeof (out as Promise<unknown>).then === "function") {
      (out as Promise<{ rowCount?: number }>).then(
        (res) => (counters.sessionRowsWritten += res?.rowCount ?? 0),
        () => undefined
      );
    }
    return out;
  };
  const originalAttach = pg.Connection.prototype.attachListeners;
  pg.Connection.prototype.attachListeners = function meteredAttach(
    this: { __client?: { activeQuery?: { text?: string } } },
    stream: NodeJS.ReadableStream
  ) {
    stream.on("data", (buf: Buffer) => {
      counters.bytesIn += buf.length;
      const t = tableOf(this.__client?.activeQuery?.text);
      counters.byTable[t] = (counters.byTable[t] ?? 0) + buf.length;
    });
    return originalAttach.call(this, stream);
  };
}

function reset() {
  counters.queries = 0;
  counters.bytesIn = 0;
  counters.begins = 0;
  counters.sessionUpdates = 0;
  counters.sessionRowsWritten = 0;
  counters.byTable = {};
}

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} gerekli`);
}

async function main() {
  assertDisposableLocalTarget(process.env.DATABASE_URL);
  if (process.env.STORE_MODE !== "db") throw new Error("STORE_MODE=db gerekli");
  patchPg();
  const label = arg("label");
  const outDir = path.resolve(arg("out", path.join(process.cwd(), ".bench-egress")));
  fs.mkdirSync(outDir, { recursive: true });

  const { runWithTenantAsync } = await import("../../src/lib/tenant-context");
  const tools = await import("../../src/lib/services/tools");
  const reg = await import("../../src/lib/auth/session-registry");
  const { getPrisma } = await import("../../src/lib/db");
  const prisma = getPrisma();
  const ctx = { role: "SUPER_ADMIN" as const, userId: "user_owner_nilufer", tenantId: TENANT, channel: "web" as const };

  // Senaryo girdileri (sentetik veri; ölçüm dışında seçilir).
  // Prisma `startsWith` LIKE joker karakterini (_) kaçırmaz — kimlik JS'te süzülür. lb_2 = Çarşamba, lb_3 = Perşembe.
  const lessonsOf = async (prefix: string, from: Date, to: Date) =>
    (
      await prisma.lesson.findMany({
        where: { tenantId: TENANT, startAt: { gte: from, lt: to } },
        orderBy: { startAt: "asc" },
      })
    ).filter((l) => new RegExp(`^${prefix}_\\d+$`).test(l.id));
  const pastLesson = (await lessonsOf("lb_2", new Date("2026-09-14"), new Date("2026-09-30")))[0];
  const futureLesson = (await lessonsOf("lb_3", new Date("2026-10-12"), new Date("2026-12-31")))[0];
  const openPayment = await prisma.payment.findFirst({
    where: { tenantId: TENANT, status: { in: ["overdue", "pending"] } },
    orderBy: { dueDate: "asc" },
  });
  const student = await prisma.student.findFirst({ where: { tenantId: TENANT, id: "sb_210" } });
  if (!pastLesson || !futureLesson || !openPayment || !student) throw new Error("bench girdileri bulunamadı (seed?)");
  const instrument = (student.instruments as string[])[0] ?? "Piyano";
  const room = (await prisma.room.findMany({ where: { tenantId: TENANT, branchId: student.branchId } })).find((r) =>
    (r.instruments as string[]).includes(instrument)
  );
  if (!room) throw new Error("uygun oda yok");

  const scenarios: { name: string; run: () => Promise<unknown> }[] = [
    { name: "Yoklama — Geldi işaretle", run: () => tools.setLessonOpsFlagTool(ctx, { lessonId: pastLesson.id, flag: "attended" }) },
    { name: "Yoklama — Geldi geri al", run: () => tools.clearLessonOpsFlagTool(ctx, { lessonId: pastLesson.id, expected: "attended" }) },
    { name: "Yoklama — İşlendi işaretle", run: () => tools.setLessonOpsFlagTool(ctx, { lessonId: pastLesson.id, flag: "processed", reason: "Bench işlendi" }) },
    { name: "Ders başlat (varlık kontrolü)", run: () => tools.startLessonTool(ctx, { lessonId: futureLesson.id }) },
    { name: "Ders bitir (varlık kontrolü)", run: () => tools.endLessonTool(ctx, { lessonId: futureLesson.id }) },
    {
      name: "Müsaitlik kartı (gün + şube)",
      run: () => tools.teacherDayAvailabilityTool(ctx, { date: "2026-10-14", branchId: student.branchId }),
    },
    {
      name: "Ders oluştur (tekil)",
      run: () =>
        tools.createLessonTool(ctx, {
          studentId: student.id,
          teacherId: student.teacherId,
          roomId: room.id,
          instrument,
          startAt: "2026-10-14T20:00",
          durationMinutes: 40,
          overrideAvailability: true,
          overrideReason: "Bench",
        }),
    },
    { name: "Tahsilat — Ödendi işaretle", run: () => tools.createPaymentTool(ctx, { paymentId: openPayment.id, method: "cash" }) },
  ];

  const rows: Record<string, unknown>[] = [];
  for (const s of scenarios) {
    reset();
    const t0 = performance.now();
    const result = (await runWithTenantAsync(TENANT, s.run)) as { ok?: boolean; error?: { code?: string; message?: string } };
    const ms = Math.round(performance.now() - t0);
    // Yanıttan sonra çalışan (after/fire-and-forget) işler de sayılsın.
    await new Promise((r) => setTimeout(r, 300));
    rows.push({
      scenario: s.name,
      ok: result?.ok ?? null,
      code: result?.ok ? undefined : result?.error?.code,
      message: result?.ok ? undefined : result?.error?.message?.slice(0, 160),
      queries: counters.queries,
      dbKB: +(counters.bytesIn / 1024).toFixed(1),
      lessonKB: +((counters.byTable.Lesson ?? 0) / 1024).toFixed(1),
      paymentKB: +((counters.byTable.Payment ?? 0) / 1024).toFixed(1),
      studentKB: +((counters.byTable.Student ?? 0) / 1024).toFixed(1),
      ms,
    });
    console.log(JSON.stringify(rows.at(-1)));
  }

  // Oturum: 5 eşzamanlı refresh (aynı oturum, RSC + prefetch + API) + 20 presence dokunuşu + 5 refresh daha.
  reset();
  const sid = await runWithTenantAsync(TENANT, () =>
    reg.startUserSession({ userId: "user_owner_nilufer", tenantId: TENANT, role: "SUPER_ADMIN" })
  );
  if (!sid) throw new Error("oturum açılamadı");
  reg.__resetPresenceForTests(); // yeni instance gibi: süreç belleğinde presence yok
  // Gerçekçi başlangıç: satır en son 10 dk önce yazılmış (access token süresi dolmuş oturum).
  const tenMinAgo = Date.now() - 10 * 60_000;
  await prisma.userSession.update({
    where: { id: sid },
    data: { lastSeenAt: new Date(tenMinAgo), expiresAt: new Date(tenMinAgo + 7 * 86_400_000) },
  });
  reset();
  const t0 = performance.now();
  const first = await Promise.all(Array.from({ length: 5 }, () => reg.extendUserSession(sid)));
  for (let i = 0; i < 20; i++) reg.touchSessionPresence(sid, { path: `/panel/x${i}` });
  await new Promise((r) => setTimeout(r, 300));
  const second = await Promise.all(Array.from({ length: 5 }, () => reg.extendUserSession(sid)));
  await new Promise((r) => setTimeout(r, 300));
  const sessionRow = {
    scenario: "Oturum — 10 refresh + 20 presence",
    ok: [...first, ...second].every(Boolean),
    queries: counters.queries,
    begins: counters.begins,
    sessionUpdates: counters.sessionUpdates,
    sessionRowsWritten: counters.sessionRowsWritten,
    dbKB: +(counters.bytesIn / 1024).toFixed(1),
    ms: Math.round(performance.now() - t0),
  };
  rows.push(sessionRow);
  console.log(JSON.stringify(sessionRow));

  // İptal edilen oturum refresh ile yeniden açılmaz.
  await reg.revokeUserSession(sid, "bench", "bench revoke");
  const afterRevoke = await reg.extendUserSession(sid);
  const revokedRow = await prisma.userSession.findUnique({ where: { id: sid }, select: { revokedAt: true } });
  const revokeCheck = { scenario: "Oturum — iptal sonrası refresh", ok: afterRevoke === false && Boolean(revokedRow?.revokedAt) };
  rows.push(revokeCheck);
  console.log(JSON.stringify(revokeCheck));

  fs.writeFileSync(path.join(outDir, `tools-${label}.json`), JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
