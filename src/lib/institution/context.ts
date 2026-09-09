import { cookies } from "next/headers";
import type { ServiceContext } from "../services/context";
import { readData, listTenants } from "../store";
import { runWithTenantAsync } from "../tenant-context";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { AppData } from "../types";
import { mergeAppData } from "./merge";
import {
  KURUM_COOKIE,
  pickInstitutionSelection,
  scopeFromSelection,
  type InstitutionScope,
  type KurumSummary,
} from "./scope";
import { canSeeAllKurumlar } from "../auth/platform-access";

export {
  ALL_KURUMLAR,
  KURUM_COOKIE,
  pickInstitutionSelection,
  scopeFromSelection,
  type InstitutionScope,
  type KurumSummary,
} from "./scope";

/**
 * Kurum müdürü (SCHOOL_ADMIN) yalnızca kendi kurumunu görür; kurum sahibi
 * (SUPER_ADMIN) platformdaki tüm aktif kurumları görür ve aralarında geçiş
 * yapabilir. json/memory modlarında tek kurum olduğundan bu her zaman
 * tek elemanlı bir listeye indirgenir.
 */
export async function listAvailableKurumlar(ctx: ServiceContext): Promise<KurumSummary[]> {
  const all = await runWithTenantAsync(DEFAULT_TENANT_ID, () => listTenants());
  if (canSeeAllKurumlar(ctx)) return all;
  const own = all.find((k) => k.tenantId === ctx.tenantId);
  return own ? [own] : [{ tenantId: ctx.tenantId, name: ctx.tenantId }];
}

export type InstitutionContext = {
  available: KurumSummary[];
  selection: string;
  scope: InstitutionScope;
};

/** Panel sayfalarının başında çağrılır — mevcut kurum tercihini cookie'den okur. */
export async function getInstitutionContext(ctx: ServiceContext): Promise<InstitutionContext> {
  const available = await listAvailableKurumlar(ctx);
  const jar = await cookies();
  const requested = jar.get(KURUM_COOKIE)?.value;
  const selection = pickInstitutionSelection(ctx.role, ctx.tenantId, available, requested, {
    canSeeAllKurumlar: canSeeAllKurumlar(ctx),
  });
  const scope = scopeFromSelection(selection, available);
  return { available, selection, scope };
}

/** Seçili kapsama göre veriyi okur — "Tüm kurumlar" ise kurumların birleşimini döner. */
export async function readScopedData(scope: InstitutionScope): Promise<AppData> {
  if (scope.mode === "single") {
    return runWithTenantAsync(scope.tenantId, () => readData());
  }
  const datasets = await Promise.all(
    scope.tenantIds.map((tenantId) => runWithTenantAsync(tenantId, () => readData()))
  );
  return mergeAppData(datasets);
}
