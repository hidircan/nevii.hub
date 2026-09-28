/**
 * Güvenli sözleşme iptali (10. tur iş #9) — test-only helper.
 *
 * `cancelStudentContractTool` artık gerekçe + sözleşme-no teyidi + kritik
 * işlem şifresi ister. İptal çağrısı yapan her test önceden
 * `setupCriticalPassword()` çağırmalı ve `secureCancelInput()` ile girdi
 * kurmalıdır. Kritik-şifre dosyası (`CRITICAL_ACTION_PASSWORD_FILE`) her
 * testte silinmelidir (ikinci kurulum "mevcut şifre" ister) — çağıran
 * dosyanın `beforeEach`'ine ekleyin.
 */
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { setCriticalActionPasswordTool } from "../services/tools";

export const TEST_CRITICAL_PASSWORD = "test-kritik-sifre-123";

export async function setupCriticalPassword(): Promise<void> {
  const ctx: ServiceContext = { role: "SUPER_ADMIN", userId: "u-owner", tenantId: DEFAULT_TENANT_ID, channel: "web" };
  const res = await setCriticalActionPasswordTool(ctx, { newPassword: TEST_CRITICAL_PASSWORD });
  if (!res.ok) throw new Error(`kritik şifre kurulamadı: ${res.error.message}`);
}

export function secureCancelInput(
  contract: { id: string; contractNumber: string },
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    contractId: contract.id,
    reason: "Test senaryosu iptal gerekçesi",
    confirmationNumber: contract.contractNumber,
    criticalPassword: TEST_CRITICAL_PASSWORD,
    ...overrides,
  };
}
