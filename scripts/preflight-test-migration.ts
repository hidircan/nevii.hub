/**
 * Test Supabase migration ÖN KONTROLÜ. Migration ÇALIŞTIRMAZ — yalnız
 * çalıştırmanın güvenli olup olmadığını söyler.
 *
 * Kullanım: npm run preflight:test-migration
 * Çıkış kodu: tüm kontroller geçerse 0, aksi halde 1 (fail-closed).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  assertDbStoreMode,
  assertMigrationSafeConnection,
  assertNotProductionRuntime,
  classifyDatabaseTarget,
} from "../src/lib/env/test-target-guard";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

function checkMigrationsDir(): string[] {
  const problems: string[] = [];
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    problems.push("prisma/migrations dizini yok — uygulanacak migration kaynağı bulunamadı.");
    return problems;
  }
  if (!fs.existsSync(path.join(MIGRATIONS_DIR, "migration_lock.toml"))) {
    problems.push(
      "prisma/migrations/migration_lock.toml eksik — `prisma migrate deploy` provider'ı doğrulayamaz."
    );
  }
  const count = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).length;
  if (count === 0) problems.push("prisma/migrations altında hiç migration yok.");
  else console.log(`[migration] committed migration sayısı: ${count}`);
  return problems;
}

function main() {
  const problems: string[] = [];
  console.log("[hedef]", classifyDatabaseTarget(process.env.DATABASE_URL).safeLabel);

  for (const check of [assertNotProductionRuntime, assertDbStoreMode]) {
    try {
      check();
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  try {
    assertMigrationSafeConnection(process.env.DATABASE_URL);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  problems.push(...checkMigrationsDir());

  if (problems.length > 0) {
    console.error("\n[PREFLIGHT BAŞARISIZ] migration ÇALIŞTIRMAYIN:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log("\n[PREFLIGHT OK] `npx prisma migrate deploy` bu hedefe karşı güvenli.");
}

main();
