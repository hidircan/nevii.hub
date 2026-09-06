/**
 * DATABASE_URL'in hangi ortamı gösterdiğini secret sızdırmadan raporlar.
 * Hiçbir şey çalıştırmaz, hiçbir yere bağlanmaz, hiçbir şey yazmaz.
 *
 * Kullanım: npm run preflight:test-db
 * Çıkış kodu: hedef test projesi ise 0, aksi halde 1 (fail-closed).
 */
import "dotenv/config";
import {
  assertTestDatabaseTarget,
  classifyDatabaseTarget,
  TargetGuardError,
} from "../src/lib/env/test-target-guard";

function main() {
  const info = classifyDatabaseTarget(process.env.DATABASE_URL);
  console.log("[hedef]", info.safeLabel);
  try {
    assertTestDatabaseTarget(process.env.DATABASE_URL);
  } catch (error) {
    console.error("[HATA]", error instanceof TargetGuardError ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  console.log("[OK] Hedef TEST Supabase projesi olarak doğrulandı.");
}

main();
