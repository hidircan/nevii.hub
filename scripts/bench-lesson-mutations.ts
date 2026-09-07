/**
 * P0 mutation performans harness'ı — ders TAŞIMA ve STATÜ değiştirme
 * akışlarının sunucu içi süresini ve DB gidiş-dönüş (round trip) SAYISINI
 * ölçer.
 *
 * Bu betik YAZMA yapar, bu yüzden YALNIZCA yerel, tek kullanımlık bir
 * PostgreSQL veritabanına karşı çalışır (guard: aşağıda). Test/production
 * Supabase'e karşı çalıştırılamaz — `assertDisposableLocalTarget` reddeder.
 *
 * Kurulum + kullanım:
 *   createdb notaplan_bench_p0
 *   npx prisma db push --url 'postgresql://<user>@127.0.0.1:5432/notaplan_bench_p0'
 *   STORE_MODE=db DATABASE_URL='postgresql://<user>@127.0.0.1:5432/notaplan_bench_p0' \
 *     npx tsx scripts/bench-lesson-mutations.ts
 */
import { addDays, addMinutes, startOfHour } from "date-fns";
import { runWithTenantAsync } from "../src/lib/tenant-context";
import { DEFAULT_TENANT_ID } from "../src/lib/auth/config";
import type { ServiceContext } from "../src/lib/services/context";

const REPEATS = Number(process.env.BENCH_REPEATS ?? 7);

/** Yazma yapan ölçüm YALNIZCA yerel tek kullanımlık DB'de çalışabilir. */
function assertDisposableLocalTarget(url: string | undefined): void {
  if (!url) throw new Error("DATABASE_URL gerekli");
  const u = new URL(url);
  const localHost = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "::1";
  const disposableName = /bench|disposable|throwaway/i.test(u.pathname);
  if (!localHost || !disposableName) {
    throw new Error(
      `Bu harness YAZMA yapar; yalnız yerel tek kullanımlık DB'ye izin verilir ` +
        `(host=127.0.0.1/localhost VE db adı 'bench'/'disposable' içermeli). Verilen: ${u.hostname}${u.pathname}`
    );
  }
}

/**
 * Yapay gidiş-dönüş gecikmesi (ms). Yerel DB'de RTT ~0.1 ms olduğu için
 * "kaç sorgu" ile "ne kadar sürer" arasındaki ilişki görünmez olur; gerçek
 * dağıtımda (Vercel ↔ Supabase) her sorgu bir ağ turudur. `BENCH_RTT_MS`
 * verildiğinde her sorguya bu gecikme eklenir ve ölçüm, o gecikmedeki bir
 * ortamın DAVRANIŞINI modeller (kesin süre değil, mertebe tahmini).
 */
const RTT_MS = Number(process.env.BENCH_RTT_MS ?? 0);

// --- DB gidiş-dönüş sayacı: pg sürücüsünün query çağrılarını sayar --------
let queryCount = 0;
let counting = false;
async function installQueryCounter() {
  const pg = await import("pg");
  const proto = (pg.default ?? pg).Client.prototype as { query: (...a: unknown[]) => unknown };
  const original = proto.query;
  proto.query = function patched(this: unknown, ...args: unknown[]) {
    if (counting) queryCount += 1;
    const run = () => original.apply(this, args);
    if (!counting || RTT_MS <= 0) return run();
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          Promise.resolve(run()).then(resolve, reject);
        } catch (err) {
          reject(err);
        }
      }, RTT_MS);
    });
  };
}

type Sample = { label: string; ms: number[]; queries: number[] };
const samples: Sample[] = [];

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

async function measure(label: string, repeats: number, fn: (i: number) => Promise<void>): Promise<void> {
  const ms: number[] = [];
  const queries: number[] = [];
  for (let i = 0; i < repeats; i++) {
    queryCount = 0;
    counting = true;
    const t0 = performance.now();
    await fn(i);
    const dt = performance.now() - t0;
    counting = false;
    ms.push(dt);
    queries.push(queryCount);
  }
  samples.push({ label, ms, queries });
}

function report() {
  const rows = samples.map((s) => {
    const sorted = [...s.ms].sort((a, b) => a - b);
    const q = [...s.queries].sort((a, b) => a - b);
    return {
      label: s.label,
      n: s.ms.length,
      min: Math.round(sorted[0]!),
      med: Math.round(pct(sorted, 50)),
      p95: Math.round(pct(sorted, 95)),
      queries: `${q[0]}–${q[q.length - 1]}`,
    };
  });
  const w = Math.max(...rows.map((r) => r.label.length), 5);
  console.log("");
  console.log(`| ${"Akış".padEnd(w)} | n | min | med | p95 | DB sorgusu |`);
  console.log(`| ${"-".repeat(w)} | - | --- | --- | --- | ---------- |`);
  for (const r of rows) {
    console.log(`| ${r.label.padEnd(w)} | ${r.n} | ${r.min} | ${r.med} | ${r.p95} | ${r.queries} |`);
  }
  console.log(`\n(süreler ms · 'DB sorgusu' tek çağrıdaki min–max gidiş-dönüş sayısı · yapay RTT ${RTT_MS} ms)`);
}

async function main() {
  assertDisposableLocalTarget(process.env.DATABASE_URL);
  if (process.env.STORE_MODE !== "db") throw new Error("STORE_MODE=db olmalı");
  await installQueryCounter();

  const store = await import("../src/lib/store-db");
  const tools = await import("../src/lib/services/tools");

  const tenantId = process.env.BENCH_TENANT_ID ?? DEFAULT_TENANT_ID;
  const ctx: ServiceContext = { role: "SCHOOL_ADMIN", userId: "bench", tenantId };

  await runWithTenantAsync(tenantId, async () => {
    // İlk readData boş şemayı seed'ler (store-db.readData davranışı).
    const data = await store.readData();
    console.log(
      `seed: ${data.students.length} öğrenci · ${data.teachers.length} öğretmen · ${data.lessons.length} ders`
    );

    // Ölçüm için ihtiyacımız olan: GELECEKTE, "scheduled", "regular" bir ders.
    const now = new Date();
    // Deterministik seçim: id'ye göre sıralı ilk uygun ders — koşular arası
    // aynı dersi ölçelim (aksi hâlde önceki koşunun bıraktığı durum seçim
    // sırasını değiştirir ve sayılar karşılaştırılamaz olur).
    const lesson = [...data.lessons]
      .filter((l) => l.type === "regular" && l.status === "scheduled" && new Date(l.startAt) > addDays(now, 1))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!lesson) throw new Error("Ölçüm için gelecekte planlanmış bir ders bulunamadı");
    const lessonId = lesson.id;
    console.log(`ölçüm dersi: ${lessonId} · ${lesson.startAt}`);

    // 1) Ders taşıma — ölçüm iki GEÇERLİ slot arasında gidip gelir. Slotlar
    //    önce sondalanır (DB durumu önceki koşulardan kaymış olabilir).
    const day = startOfHour(new Date(lesson.startAt));
    const slots: string[] = [];
    for (let h = -12; h <= 12 && slots.length < 2; h++) {
      const candidate = addMinutes(day, h * 60).toISOString();
      const probe = await tools.updateLessonScheduleTool(ctx, { lessonId, startAt: candidate });
      if (probe.ok) slots.push(candidate);
    }
    if (slots.length < 2) throw new Error("ölçüm için iki geçerli slot bulunamadı");
    console.log(`ölçüm slotları: ${slots.join(" ↔ ")}`);

    await measure("1. Ders taşıma (updateLessonScheduleTool)", REPEATS, async (i) => {
      const res = await tools.updateLessonScheduleTool(ctx, {
        lessonId,
        startAt: slots[i % 2]!,
      });
      if (!res.ok) throw new Error(`taşıma başarısız: ${res.error.message}`);
    });

    // 2) Statü değiştirme — attended ↔ absent (confirmSwitch ile).
    await measure("2. Statü değiştirme (setLessonOpsFlagTool)", REPEATS, async (i) => {
      const flag = i % 2 === 0 ? "attended" : "absent";
      const res = await tools.setLessonOpsFlagTool(ctx, { lessonId, flag, confirmSwitch: true });
      if (!res.ok) throw new Error(`statü başarısız: ${res.error.message}`);
    });

    // 3) Karşılaştırma tabanı — tam tenant okuması.
    await measure("3. readData() (tam tenant, karşılaştırma)", REPEATS, async () => {
      await store.readData();
    });
  });

  report();
  const { prisma } = await import("../src/lib/db");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
