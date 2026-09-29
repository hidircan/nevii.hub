import { promises as fs } from "fs";
import { DEFAULT_TENANT_ID } from "../../auth/config";
import { CRITICAL_ACTION_PASSWORD_FILE, setCriticalActionPassword } from "../../critical-action-password";
import { __resetRateLimitForTests } from "../../rate-limit";

/** 2026-09-29 — "Sil" eylemleri kritik şifre + gerekçe ister; testler bu sabitlerle geçer. */
export const TEST_CRITICAL_PASSWORD = "Test-Kritik-Sifre-1";
export const CRIT = { criticalPassword: TEST_CRITICAL_PASSWORD, reason: "Test amaçlı silme gerekçesi" };

/** Kurum kritik şifresini sıfırdan belirler (json store) ve rate-limit sayacını temizler. */
export async function withTestCriticalPassword(tenantId: string = DEFAULT_TENANT_ID): Promise<void> {
  await fs.rm(CRITICAL_ACTION_PASSWORD_FILE, { force: true });
  __resetRateLimitForTests();
  await setCriticalActionPassword(tenantId, TEST_CRITICAL_PASSWORD, "user_test_owner");
}
