/**
 * P0-3/P0-5 (2026-08-29) — owner nihai kararı: telafi kullanım süresi 30
 * takvim günü, orijinal kaçırılan ders tarihinden itibaren. Mekanizma
 * (addDays(lesson.startAt, makeupWindowDays)) zaten doğruydu (bkz.
 * docs/contracts/LEGAL_POLICY_TEXT_DISCREPANCY_REPORT.md) ama tenant'ın
 * GERÇEK ayarı (`School.makeupWindowDays`) 14 idi, 30 DEĞİL — sözleşme metni
 * (bu oturumda "30 gün" olarak güncellendi) ile sistemin GERÇEKTEN uyguladığı
 * pencere arasında somut bir tutarsızlık vardı. Bu script SADECE bu sayıyı
 * düzeltir; addDays mekanizmasına DOKUNMAZ.
 *
 * Çalıştırma: STORE_MODE=json npx tsx scripts/set-makeup-window-30-days.ts
 */
import { updateMakeupWindowDaysTool } from "../src/lib/services/tools";
import { DEFAULT_TENANT_ID } from "../src/lib/auth/config";
import { runWithTenantAsync } from "../src/lib/tenant-context";

async function main() {
  const tenantId = process.env.DEFAULT_TENANT_ID || DEFAULT_TENANT_ID;
  const result = await runWithTenantAsync(tenantId, () =>
    updateMakeupWindowDaysTool(
      { role: "SUPER_ADMIN", userId: "system_migration_2026_2027", tenantId, channel: "web" },
      { makeupWindowDays: 30 }
    )
  );
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
