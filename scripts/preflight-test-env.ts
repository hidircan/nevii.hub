/**
 * Test ortamı env ÖN KONTROLÜ. Migration/seed/deploy ÇALIŞTIRMAZ, DNS'e veya
 * Vercel'e dokunmaz, hiçbir secret DEĞERİNİ okumaz/yazmaz — yalnız İSİM ve
 * güvenli metadata kontrol eder.
 *
 * Kullanım: npm run preflight:test-env
 * Çıkış kodu: tüm kontroller geçerse 0, aksi halde 1 (fail-closed).
 */
import "dotenv/config";
import {
  assertNotProductionRuntime,
  assertTestDatabaseTarget,
  classifyDatabaseTarget,
  missingEnvNames,
  productionLeakWarnings,
  REQUIRED_TEST_ENV,
} from "../src/lib/env/test-target-guard";

function main() {
  const problems: string[] = [];

  try {
    assertNotProductionRuntime();
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  const missing = missingEnvNames(REQUIRED_TEST_ENV);
  console.log(
    `[env] zorunlu değişken: ${REQUIRED_TEST_ENV.length}, eksik: ${missing.length}` +
      (missing.length > 0 ? ` → ${missing.join(", ")}` : "")
  );
  if (missing.length > 0) problems.push(`Eksik env değişkenleri: ${missing.join(", ")}`);

  console.log("[hedef]", classifyDatabaseTarget(process.env.DATABASE_URL).safeLabel);
  try {
    assertTestDatabaseTarget(process.env.DATABASE_URL);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  for (const warning of productionLeakWarnings()) problems.push(warning);

  if (problems.length > 0) {
    console.error("\n[PREFLIGHT BAŞARISIZ] test ortamı hazır değil:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log("\n[PREFLIGHT OK] test ortamı env kontrolleri geçti.");
}

main();
