/**
 * Build kapısı (SALT OKUNUR) — repo'daki migration'lardan test DB'de uygulanmamış olan varsa
 * build'i durdurur; Vercel böylece önceki READY deployment'ı sunmaya devam eder ve panel
 * eksik kolon yüzünden çökmez (2026-09-27 P0: Room.deletedAt / P2022).
 *
 * Yalnız `test` dalının Vercel build'inde çalışır (VERCEL_GIT_COMMIT_REF=test). Production ve
 * yerel build'ler etkilenmez. Acil durumda SKIP_MIGRATION_GATE=1 ile atlanabilir (loglanır).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { resolvePgConnection } from "../src/lib/db/connection";
import { findPendingMigrations, pendingMigrationsMessage, type AppliedMigrationRow } from "../src/lib/ops/pending-migrations";

async function main() {
  if (process.env.VERCEL_GIT_COMMIT_REF !== "test") return;
  if (process.env.SKIP_MIGRATION_GATE === "1") {
    console.warn("[migration-gate] SKIP_MIGRATION_GATE=1 — kontrol atlandı.");
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migration-gate] DATABASE_URL build ortamında yok; migration durumu doğrulanamadı.");
    process.exitCode = 1;
    return;
  }
  const dir = path.join(process.cwd(), "prisma", "migrations");
  const committed = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const pool = new Pool(resolvePgConnection(url));
  try {
    const { rows } = await pool.query<AppliedMigrationRow>(
      "select migration_name, finished_at, rolled_back_at from _prisma_migrations"
    );
    const pending = findPendingMigrations(committed, rows);
    if (pending.length > 0) {
      console.error(`[migration-gate] ${pendingMigrationsMessage(pending)}`);
      process.exitCode = 1;
      return;
    }
    console.log(`[migration-gate] OK — ${committed.length} migration'ın tümü uygulanmış.`);
  } catch (error) {
    console.error("[migration-gate] Migration durumu okunamadı:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
