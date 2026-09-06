/**
 * Test Supabase şema doğrulaması — migration SONRASI çalıştırılır.
 * SALT OKUNUR: yalnız SELECT çalıştırır, hiçbir şey yazmaz/değiştirmez.
 *
 * Kontrol ettikleri: _prisma_migrations sayısı, beklenen çekirdek tablolar,
 * tenant index'leri, pgvector extension, RLS durumu.
 *
 * Kullanım: npm run verify:test-schema
 * Çıkış kodu: her şey beklendiği gibiyse 0, aksi halde 1.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { assertTestDatabaseTarget, classifyDatabaseTarget } from "../src/lib/env/test-target-guard";
import { resolvePgConnection } from "../src/lib/db/connection";

/** Şemanın "gerçekten kuruldu" sayılması için var olması gereken çekirdek tablolar. */
const CORE_TABLES = ["Tenant", "User", "Student", "Teacher", "Lesson", "Payment", "MakeupRequest"];

function committedMigrationCount(): number {
  const dir = path.join(process.cwd(), "prisma", "migrations");
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
}

async function main() {
  console.log("[hedef]", classifyDatabaseTarget(process.env.DATABASE_URL).safeLabel);
  try {
    assertTestDatabaseTarget(process.env.DATABASE_URL);
  } catch (error) {
    console.error("[HATA]", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const pool = new Pool(resolvePgConnection(process.env.DATABASE_URL!));
  const problems: string[] = [];
  try {
    const tables = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'"
    );
    const present = new Set(tables.rows.map((row) => row.table_name));
    console.log(`[tablo] public şemasında ${present.size} tablo`);

    const missing = CORE_TABLES.filter((name) => !present.has(name));
    if (missing.length > 0) problems.push(`Eksik çekirdek tablolar: ${missing.join(", ")}`);

    if (!present.has("_prisma_migrations")) {
      problems.push("_prisma_migrations tablosu yok — hiç migration uygulanmamış.");
    } else {
      const applied = await pool.query<{ count: string }>(
        "select count(*)::text as count from _prisma_migrations where finished_at is not null"
      );
      const expected = committedMigrationCount();
      console.log(`[migration] uygulanan: ${applied.rows[0].count} / repo'daki: ${expected}`);
      if (Number(applied.rows[0].count) < expected) {
        problems.push("Uygulanan migration sayısı repo'daki migration sayısından az.");
      }
    }

    const vector = await pool.query<{ installed_version: string | null }>(
      "select installed_version from pg_available_extensions where name = 'vector'"
    );
    const vectorInstalled = Boolean(vector.rows[0]?.installed_version);
    console.log(`[pgvector] kurulu: ${vectorInstalled ? "evet" : "hayır"}`);
    if (!vectorInstalled && (process.env.VECTOR_BACKEND || "file").toLowerCase() === "pgvector") {
      problems.push("VECTOR_BACKEND=pgvector ama `vector` extension kurulu değil.");
    }

    const rls = await pool.query<{ relname: string }>(
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace " +
        "where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true"
    );
    console.log(
      `[RLS] etkin tablo sayısı: ${rls.rowCount} ` +
        "(uygulama tenant izolasyonunu ALS + Prisma sorgu katmanında yapar; RLS beklenen değil)"
    );

    const indexes = await pool.query<{ count: string }>(
      "select count(*)::text as count from pg_indexes where schemaname = 'public' " +
        "and indexdef ilike '%tenantId%'"
    );
    console.log(`[index] tenantId içeren index sayısı: ${indexes.rows[0].count}`);
    if (present.size > 0 && Number(indexes.rows[0].count) === 0) {
      problems.push("tenantId içeren hiç index yok — çok-tenantlı sorgular tarama yapacak.");
    }
  } catch (error) {
    problems.push(`Sorgu hatası: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await pool.end();
  }

  if (problems.length > 0) {
    console.error("\n[ŞEMA DOĞRULAMA BAŞARISIZ]:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log("\n[ŞEMA DOĞRULAMA OK]");
}

void main();
