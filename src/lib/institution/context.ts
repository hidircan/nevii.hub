import { cache } from "react";
import { cookies } from "next/headers";
import type { ServiceContext } from "../services/context";
import {
  readData,
  readDashboardData,
  readLessonWindow,
  readMakeupCenterData,
  readPaymentsPageData,
  readPayoutWindow,
  readReferenceData,
  readStudentListData,
  readStudentScope,
  readTeacherPayoutsForTeacher,
  readLessonsForTeacher,
  listTenants,
} from "../store";
import {
  narrowToDashboard,
  narrowToLessonWindow,
  narrowToMakeupCenter,
  type MakeupCenterData,
  narrowToPaymentsPage,
  narrowToPayoutWindow,
  narrowToStudentScope,
  toPaymentStatusRow,
  toReferenceData,
  type DashboardData,
  type LessonWindowData,
  type PaymentsPageData,
  type PayoutWindowData,
  type ReferenceData,
  type StudentListData,
  type StudentScopeData,
} from "../reference-data";
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
  if (scope.mode === "single") return `single:${scope.tenantId}`;
  // DB egress (2026-10-16): tek kurumlu "Tüm kurumlar" görünümü o kurumun verisinin AYNISIDIR (`mergeAppData` tek
  // seti aynen döner) — okuma dar dilim yoluna gider. Canlıda tek okul varken bu görünüm program/ödeme/öğrenci
  // dahil her sayfayı tam okumaya düşürüyordu. Yazma kapısı `scope.mode`'a bakar; bu yalnız OKUMA anahtarıdır.
  if (scope.tenantIds.length === 1) return `single:${scope.tenantIds[0]}`;
  return `all:${[...scope.tenantIds].sort().join(",")}`;
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

const readScopedReferenceDataByKey = cache(async (key: string): Promise<ReferenceData> => {
  if (key.startsWith("single:")) {
    return runWithTenantAsync(key.slice("single:".length), () => readReferenceData());
  }
  // "Tüm kurumlar" (yalnız platform sahibi) — birleştirme kuralı tek yerde kalsın diye tam okumadan türetilir.
  return toReferenceData(await readScopedDataByKey(key));
});

/**
 * DB egress (2026-09-30) — ders/ödeme/yoklama/telafi satırlarını göstermeyen panel sayfaları
 * için `readScopedData`'nın dar karşılığı (bkz. src/lib/reference-data.ts). İstek başına memoize.
 */
export async function readScopedReferenceData(scope: InstitutionScope): Promise<ReferenceData> {
  return readScopedReferenceDataByKey(scopeCacheKey(scope));
}

const readScopedStudentDataByKey = cache(async (key: string, studentId: string): Promise<StudentScopeData> => {
  if (key.startsWith("single:")) {
    return runWithTenantAsync(key.slice("single:".length), () => readStudentScope(studentId));
  }
  return narrowToStudentScope(await readScopedDataByKey(key), studentId);
});

/**
 * DB egress (2026-09-30) — tek öğrencinin ekranları için `readScopedData`'nın dar karşılığı
 * (bkz. src/lib/reference-data.ts `StudentScopeData`). İstek başına memoize (layout + sekme).
 */
export async function readScopedStudentData(scope: InstitutionScope, studentId: string): Promise<StudentScopeData> {
  return readScopedStudentDataByKey(scopeCacheKey(scope), studentId);
}

const readScopedLessonWindowByKey = cache(async (key: string, fromIso: string, toIso: string): Promise<LessonWindowData> => {
  if (key.startsWith("single:")) {
    return runWithTenantAsync(key.slice("single:".length), () => readLessonWindow(fromIso, toIso));
  }
  return narrowToLessonWindow(await readScopedDataByKey(key), new Date(fromIso), new Date(toIso));
});

const readScopedMakeupCenterDataByKey = cache(async (key: string): Promise<MakeupCenterData> => {
  if (key.startsWith("single:")) {
    return runWithTenantAsync(key.slice("single:".length), () => readMakeupCenterData({ lessons: "planning" }));
  }
  return narrowToMakeupCenter(await readScopedDataByKey(key), { lessons: "planning" });
});

const readScopedTeacherPayoutsByKey = cache(async (key: string, teacherId: string): Promise<AppData["teacherPayouts"]> => {
  if (key.startsWith("single:")) {
    return runWithTenantAsync(key.slice("single:".length), () => readTeacherPayoutsForTeacher(teacherId));
  }
  return (await readScopedDataByKey(key)).teacherPayouts.filter((p) => p.teacherId === teacherId);
});

const readScopedTeacherLessonsByKey = cache(async (key: string, teacherId: string): Promise<AppData["lessons"]> => {
  if (key.startsWith("single:")) {
    return runWithTenantAsync(key.slice("single:".length), () => readLessonsForTeacher(teacherId));
  }
  return (await readScopedDataByKey(key)).lessons.filter((l) => l.teacherId === teacherId);
});

/** DB egress (2026-10-18) — bir öğretmenin tüm dersleri (öğretmen detayı Özet / Program / Yoklama). */
export async function readScopedTeacherLessons(scope: InstitutionScope, teacherId: string): Promise<AppData["lessons"]> {
  return readScopedTeacherLessonsByKey(scopeCacheKey(scope), teacherId);
}

/** DB egress (2026-10-17) — bir öğretmenin kayıtlı hakedişleri (öğretmen detayı Hakediş / Ödeme Geçmişi). */
export async function readScopedTeacherPayouts(scope: InstitutionScope, teacherId: string): Promise<AppData["teacherPayouts"]> {
  return readScopedTeacherPayoutsByKey(scopeCacheKey(scope), teacherId);
}

/** DB egress (2026-10-16) — Telafi Merkezi (bkz. reference-data.ts `MakeupCenterData`); 2026-10-18: `"planning"` dersleri. */
export async function readScopedMakeupCenterData(scope: InstitutionScope): Promise<MakeupCenterData> {
  return readScopedMakeupCenterDataByKey(scopeCacheKey(scope));
}

/** DB egress (2026-09-30) — Ders Programı haftası (bkz. reference-data.ts `LessonWindowData`). */
export async function readScopedLessonWindow(scope: InstitutionScope, from: Date, to: Date): Promise<LessonWindowData> {
  return readScopedLessonWindowByKey(scopeCacheKey(scope), from.toISOString(), to.toISOString());
}

const readScopedStudentListDataByKey = cache(async (key: string): Promise<StudentListData> => {
  if (key.startsWith("single:")) {
    return runWithTenantAsync(key.slice("single:".length), () => readStudentListData());
  }
  const full = await readScopedDataByKey(key);
  return { ...toReferenceData(full), payments: full.payments.map(toPaymentStatusRow) };
});

/** DB egress (2026-09-30) — Öğrenciler listesi (bkz. reference-data.ts `StudentListData`). */
export async function readScopedStudentListData(scope: InstitutionScope): Promise<StudentListData> {
  return readScopedStudentListDataByKey(scopeCacheKey(scope));
}

const readScopedPaymentsPageDataByKey = cache(async (key: string): Promise<PaymentsPageData> => {
  if (key.startsWith("single:")) {
    return runWithTenantAsync(key.slice("single:".length), () => readPaymentsPageData());
  }
  return narrowToPaymentsPage(await readScopedDataByKey(key));
});

/** DB egress (2026-09-30) — Ödemeler (bkz. reference-data.ts `PaymentsPageData`). */
export async function readScopedPaymentsPageData(scope: InstitutionScope): Promise<PaymentsPageData> {
  return readScopedPaymentsPageDataByKey(scopeCacheKey(scope));
}

const readScopedPayoutWindowByKey = cache(async (key: string, fromIso: string, toIso: string): Promise<PayoutWindowData> => {
  if (key.startsWith("single:")) {
    return runWithTenantAsync(key.slice("single:".length), () => readPayoutWindow(fromIso, toIso));
  }
  return narrowToPayoutWindow(await readScopedDataByKey(key), new Date(fromIso), new Date(toIso));
});

/** DB egress (2026-09-30) — Hakedişler (bkz. reference-data.ts `PayoutWindowData`). */
export async function readScopedPayoutWindow(scope: InstitutionScope, from: Date, to: Date): Promise<PayoutWindowData> {
  return readScopedPayoutWindowByKey(scopeCacheKey(scope), from.toISOString(), to.toISOString());
}

const readScopedDashboardDataByKey = cache(
  async (key: string, fromIso: string, toIso: string, nowIso: string): Promise<DashboardData> => {
    if (key.startsWith("single:")) {
      return runWithTenantAsync(key.slice("single:".length), () => readDashboardData(fromIso, toIso, nowIso));
    }
    return narrowToDashboard(await readScopedDataByKey(key), new Date(fromIso), new Date(toIso), new Date(nowIso));
  }
);

/** DB egress (2026-09-30) — Panel özeti (bkz. reference-data.ts `DashboardData`). */
export async function readScopedDashboardData(scope: InstitutionScope, from: Date, to: Date, now: Date): Promise<DashboardData> {
  return readScopedDashboardDataByKey(scopeCacheKey(scope), from.toISOString(), to.toISOString(), now.toISOString());
}
