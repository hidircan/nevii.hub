/**
 * Kurum uygulama dili. Kaynak sırası: tenant ayar override'ı
 * (`locale.language`) → `Tenant.language` → Türkçe.
 * İstemci girdisi dil kararı değildir. Bu dosya store import eder;
 * istemci bileşenleri `copy.ts` kullanır.
 */
import { getPlatformTenant } from "@/lib/platform/store";
import { resolveSetting } from "@/lib/platform/resolve";
import { pickTenantLanguage, type AppLocale } from "./copy";

export type { AppLocale };
export {
  LOCALE_COOKIE,
  authCopy,
  formatInLocale,
  formatNumberInLocale,
  institutionNameMismatch,
  loginErrorText,
  normalizeAppLocale,
  passwordResetMail,
  pickTenantLanguage,
  readLocaleCookie,
  terminalShellByDefault,
} from "./copy";

export async function resolveTenantLanguage(tenantId: string): Promise<AppLocale> {
  const [setting, tenant] = await Promise.all([
    resolveSetting({ tenantId }, "locale.language").catch(() => null),
    getPlatformTenant(tenantId).catch(() => null),
  ]);
  return pickTenantLanguage({
    overrideScope: setting?.sourceScope ?? null,
    overrideValue: setting?.effectiveValue,
    tenantLanguage: tenant?.language,
  });
}
