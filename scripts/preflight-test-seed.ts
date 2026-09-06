/**
 * Test Supabase demo seed ÖN KONTROLÜ (A/B/C/D telafi + Program Vitrini).
 * Seed ÇALIŞTIRMAZ — yalnız çalıştırmanın güvenli olup olmadığını söyler.
 *
 * Kullanım: npm run preflight:test-seed
 * Çıkış kodu: tüm kontroller geçerse 0, aksi halde 1 (fail-closed).
 */
import "dotenv/config";
import {
  assertDbStoreMode,
  assertNotProductionRuntime,
  assertTestDatabaseTarget,
  classifyDatabaseTarget,
} from "../src/lib/env/test-target-guard";

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
    assertTestDatabaseTarget(process.env.DATABASE_URL);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  if (problems.length > 0) {
    console.error("\n[PREFLIGHT BAŞARISIZ] demo seed ÇALIŞTIRMAYIN:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log("\n[PREFLIGHT OK] `npm run seed:makeup-demo` bu hedefe karşı güvenli.");
}

main();
