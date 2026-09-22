/**
 * Sözleşme sürüm onarımı — DRY RUN varsayılan.
 *
 * Kök sorun: iptal sonrası oluşturulan yeni "initial" sözleşmeler
 * versionNumber=1 ile kalmış olabilir. Güncel sözleşme artık statüye
 * bakar (cancelled/superseded elenir), bu yüzden ekran bu script olmadan
 * da doğrudur. Script yalnız sürüm numaralarını createdAt sırasına
 * çeker ki "en yüksek sürüm = en son sözleşme" tarihsel veride de tutsun.
 *
 * Çalıştırma (yazmaz):
 *   STORE_MODE=json npx tsx scripts/repair-contract-current-versions.ts
 * Yazmak için: --apply
 *
 * Production veritabanına bu scripti bir ajan OTURUMU ÇALIŞTIRMAZ.
 * Test/staging için insan onayı gerekir.
 */
import { listContractsForStudent } from "../src/lib/contracts";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLY" : "DRY RUN — sürüm değişikliği yazılmayacak");
  console.log(
    "Bu script öğrenci kimliği listesi ister. Tek öğrenci: STUDENT_ID=... TENANT_ID=... npx tsx scripts/repair-contract-current-versions.ts"
  );
  const tenantId = process.env.TENANT_ID;
  const studentId = process.env.STUDENT_ID;
  if (!tenantId || !studentId) {
    console.log("TENANT_ID ve STUDENT_ID yok — çıkılıyor. Toplu tarama bilinçli olarak yok (yanlış tenant riski).");
    return;
  }
  const rows = await listContractsForStudent(tenantId, studentId);
  const ordered = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  ordered.forEach((row, index) => {
    const next = index + 1;
    const flag = row.versionNumber === next ? "ok" : `version ${row.versionNumber} → ${next}`;
    console.log(`${row.contractNumber} ${row.status} created ${row.createdAt} ${flag}`);
  });
  if (!apply) return;
  console.log("--apply bu turda kasıtlı olarak yazmaz: sürüm numarası hukuki belgede donmuş olabilir. Güncel rozet statüden gelir.");
}

void main();
