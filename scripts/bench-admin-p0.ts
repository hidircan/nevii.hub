/**
 * P0 UAT performans ölçüm harness'ı — Yoklama Takvimi ve Ders Programı
 * akışlarının katman katman (DB round trip → store okuması → tool → toplam)
 * süresini ölçer. SALT OKUNUR: hiçbir veri yazmaz, migration/seed çalıştırmaz.
 *
 * Kullanım (test ortamı env'i ile):
 *   set -a && . ./.env.test && set +a && npx tsx scripts/bench-admin-p0.ts
 *
 * Çıktı, `docs/performance/ADMIN_WEB_P0_BASELINE.md`'deki tabloların kaynağıdır;
 * aynı komut düzeltme sonrası tekrar çalıştırılıp "final" sütunu doldurulur.
 */
import "dotenv/config";
import { runWithTenantAsync } from "../src/lib/tenant-context";
import { assertTestDatabaseTarget } from "../src/lib/env/test-target-guard";
import { DEFAULT_TENANT_ID } from "../src/lib/auth/config";
import type { ServiceContext } from "../src/lib/services/context";

const REPEATS = Number(process.env.BENCH_REPEATS ?? 5);

type Sample = { label: string; ms: number[] };
const samples: Sample[] = [];

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

async function measure<T>(label: string, repeats: number, fn: () => Promise<T>): Promise<T> {
  let last: T | undefined;
  const ms: number[] = [];
  for (let i = 0; i < repeats; i++) {
    const t0 = performance.now();
    last = await fn();
    ms.push(performance.now() - t0);
  }
  samples.push({ label, ms });
  return last as T;
}

function report() {
  const rows = samples.map((s) => {
    const sorted = [...s.ms].sort((a, b) => a - b);
    return {
      label: s.label,
      n: s.ms.length,
      min: Math.round(sorted[0]!),
      med: Math.round(pct(sorted, 50)),
      p95: Math.round(pct(sorted, 95)),
      max: Math.round(sorted[sorted.length - 1]!),
    };
  });
  const w = Math.max(...rows.map((r) => r.label.length), 5);
  console.log("");
  console.log(`| ${"Akış".padEnd(w)} | n | min | med | p95 | max |`);
  console.log(`| ${"-".repeat(w)} | - | --- | --- | --- | --- |`);
  for (const r of rows) {
    console.log(
      `| ${r.label.padEnd(w)} | ${r.n} | ${r.min} | ${r.med} | ${r.p95} | ${r.max} |`
    );
  }
  console.log("\n(süreler ms)");
}

async function main() {
  assertTestDatabaseTarget(process.env.DATABASE_URL);
  if (process.env.STORE_MODE !== "db") throw new Error("STORE_MODE=db olmalı (ölçüm db modunda anlamlıdır)");

  const { prisma } = await import("../src/lib/db");
  const store = await import("../src/lib/store-db");
  const tools = await import("../src/lib/services/tools");
  const { termMonths } = await import("../src/lib/attendance-calendar");

  const tenantId = process.env.BENCH_TENANT_ID ?? DEFAULT_TENANT_ID;
  const ctx: ServiceContext = { role: "SCHOOL_ADMIN", userId: "bench", tenantId };

  await runWithTenantAsync(tenantId, async () => {
    // 0) Ham DB gidiş-dönüşü — ağ/bölge gecikmesinin tabanı.
    await measure("0. DB ping (SELECT 1)", REPEATS, async () => {
      await prisma.$queryRaw`SELECT 1`;
    });

    // 1) readData() — tüm tenant AppData'sı (schoolInclude 12 relation + 2 sorgu).
    const data = await measure("1. readData() tüm tenant", REPEATS, () => store.readData());
    console.log(
      `[veri boyutu] öğrenci=${data.students.length} öğretmen=${data.teachers.length} ders=${data.lessons.length} ödeme=${data.payments.length} yoklama=${data.attendances.length}`
    );

    const student =
      data.students.find((s) => data.lessons.some((l) => l.studentId === s.id)) ?? data.students[0];
    if (!student) throw new Error("Ölçüm için öğrenci yok");
    console.log(`[ölçüm öğrencisi] ${student.id} (${student.termType ?? "guz"})`);

    const term = student.termType ?? "guz";
    const anchor = term === "yaz" ? new Date().getFullYear() : new Date().getFullYear();
    const months = termMonths(term, anchor);

    // 2) Tek ay tool'u — takvimin tek bir kutusunun sunucu maliyeti.
    await measure("2. getAttendanceCalendarMonthTool (tek ay)", REPEATS, async () => {
      const r = await tools.getAttendanceCalendarMonthTool(ctx, {
        studentId: student.id,
        year: months[0]!.year,
        month: months[0]!.month,
      });
      if (!r.ok) throw new Error(r.error.message);
    });

    // 3) Takvim SERİ yükleme — mevcut istemci davranışı (for + await).
    await measure(`3. takvim SERİ ${months.length} ay (mevcut istemci)`, Math.max(2, Math.ceil(REPEATS / 2)), async () => {
      for (const m of months) {
        const r = await tools.getAttendanceCalendarMonthTool(ctx, {
          studentId: student.id,
          year: m.year,
          month: m.month,
        });
        if (!r.ok) throw new Error(r.error.message);
      }
    });

    // 4) Takvim PARALEL yükleme — aynı iş, tek turda (ara adım; asıl düzeltme 5).
    await measure(`4. takvim PARALEL ${months.length} ay`, Math.max(2, Math.ceil(REPEATS / 2)), async () => {
      const rs = await Promise.all(
        months.map((m) =>
          tools.getAttendanceCalendarMonthTool(ctx, { studentId: student.id, year: m.year, month: m.month })
        )
      );
      for (const r of rs) if (!r.ok) throw new Error(r.error.message);
    });

    // 5) Takvim DÖNEM tool'u — düzeltme sonrası istemcinin yaptığı TEK istek.
    await measure(`5. takvim DÖNEM tek istek (${months.length} ay)`, REPEATS, async () => {
      const r = await tools.getAttendanceCalendarTermTool(ctx, {
        studentId: student.id,
        term,
        anchorYear: anchor,
      });
      if (!r.ok) throw new Error(r.error.message);
      if (r.data.months.length !== months.length) {
        throw new Error(`beklenen ${months.length} ay, gelen ${r.data.months.length}`);
      }
    });

    // 6) Ders Programı sayfa verisi — /panel/program server component'inin okuması.
    await measure("6. program sayfa verisi (readData)", REPEATS, () => store.readData());
  });

  report();
  await (await import("../src/lib/db")).prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
