import { cache } from "react";
import { cookies } from "next/headers";
import type { ServiceContext } from "../services/context";
import { readData, listTenants } from "../store";
import { runWithTenantAsync } from "../tenant-context";
import { DEFAULT_TENANT_ID, PLATFORM_TENANT_ID } from "../auth/config";
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
 * Kurum müdürü (SCHOOL_ADMIN) ve kurum sahibi (SUPER_ADMIN) yalnızca kendi
 * kurumunu görür. Tenantlar arası liste yalnız HYPER_ADMIN içindir (ve
 * sentetik platform tenant'ı hariç tutulur). json/memory modlarında tek
 * kurum olduğundan bu her zaman tek elemanlı bir listeye indirgenir.
 */
export async function listAvailableKurumlar(ctx: ServiceContext): Promise<KurumSummary[]> {
  const all = await runWithTenantAsync(DEFAULT_TENANT_ID, () => listTenants());
  const schools = all.filter((k) => k.tenantId !== PLATFORM_TENANT_ID);
  if (canSeeAllKurumlar(ctx)) return schools;
  const own = schools.find((k) => k.tenantId === ctx.tenantId);
  return own ? [own] : [{ tenantId: ctx.tenantId, name: ctx.tenantId }];
}

export type InstitutionContext = {
  available: KurumSummary[];
  selection: string;
  scope: InstitutionScope;
};

/**
 * Panel sayfalarının başında çağrılır — mevcut kurum tercihini cookie'den okur.
 *
 * PERFORMANS: `readScopedData` ile AYNI gerekçeyle istek başına memoize edilir
 * (sayfa + layout + alt bileşen aynı bağlamı ister; `listTenants()` turu bir
 * kez yeter). Anahtar rol+tenant'tır — farklı kullanıcı/kurum asla aynı
 * girdiyi paylaşmaz.
 */
export const getInstitutionContext = cache(async function getInstitutionContext(
  ctx: ServiceContext
): Promise<InstitutionContext> {
  const available = await listAvailableKurumlar(ctx);
  const jar = await cookies();
  const requested = jar.get(KURUM_COOKIE)?.value;
  const selection = pickInstitutionSelection(ctx.role, ctx.tenantId, available, requested, {
    canSeeAllKurumlar: canSeeAllKurumlar(ctx),
  });
  const scope = scopeFromSelection(selection, available);
  return { available, selection, scope };
});

/**
 * PERFORMANS (2026-09-20) — İSTEK BAŞINA TEK OKUMA.
 *
 * `readScopedData` tenant'ın TÜM verisini okur ve bir panel sayfasının
 * render'ı sırasında birden çok kez çağrılabiliyordu (sayfa + layout +
 * çağrılan tool'lar). React 19 `cache()` bunu istek başına TEK okumaya
 * indirger; sonraki çağrılar aynı nesneyi alır.
 *
 * NEDEN GÜVENLİ: `readScopedData` YALNIZCA RSC sayfa/layout render'ından
 * çağrılır (yazma yapan tool'lar `readData()` kullanır, o memoize EDİLMEZ).
 * Bir Server Action önce çalışır, sayfa ONDAN SONRA render edilir — yani
 * render içindeki ilk okuma her zaman TAZEDİR. Bayat veri riski yoktur.
 *
 * Anahtar, nesne kimliği değil KAPSAM DİZESİDİR: her çağıran kendi `scope`
 * nesnesini kurar, nesne kimliğine göre memoize etmek hiç isabet etmezdi.
 */
function scopeCacheKey(scope: InstitutionScope): string {
  return scope.mode === "single" ? `single:${scope.tenantId}` : `all:${[...scope.tenantIds].sort().join(",")}`;
}

const readScopedDataByKey = cache(async (key: string): Promise<AppData> => {
  if (key.startsWith("single:")) {
    const tenantId = key.slice("single:".length);
    return runWithTenantAsync(tenantId, () => readData());
  }
  const tenantIds = key.slice("all:".length).split(",").filter(Boolean);
  const datasets = await Promise.all(
    tenantIds.map((tenantId) => runWithTenantAsync(tenantId, () => readData()))
  );
  return mergeAppData(datasets);
});

/** Seçili kapsama göre veriyi okur — "Tüm kurumlar" ise kurumların birleşimini döner. */
export async function readScopedData(scope: InstitutionScope): Promise<AppData> {
  return readScopedDataByKey(scopeCacheKey(scope));
}
