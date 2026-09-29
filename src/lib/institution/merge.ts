import type { AppData } from "../types";

/**
 * "Tüm kurumlar" görünümü için birden fazla kurumun (tenant) AppData'sını
 * tek bir listeye birleştirir. Salt okunur bir toplulaştırmadır — yazma
 * işlemleri her zaman tek bir kurum kapsamında kalır. `settings` alanı
 * anlamlı bir tekil değeri olmadığından ilk kurumdan alınır; yalnızca
 * `branches` tüm kurumların şubelerinin birleşimidir (mevcut şube filtresi
 * "Tüm kurumlar" görünümünde de bu birleşim üzerinde çalışmaya devam eder).
 */
export function mergeAppData(datasets: AppData[]): AppData {
  if (datasets.length === 0) {
    throw new Error("mergeAppData: en az bir veri seti gerekir");
  }
  if (datasets.length === 1) return datasets[0];

  const first = datasets[0];
  return {
    settings: {
      ...first.settings,
      branches: datasets.flatMap((d) => d.settings.branches),
    },
    teachers: datasets.flatMap((d) => d.teachers),
    students: datasets.flatMap((d) => d.students),
    rooms: datasets.flatMap((d) => d.rooms),
    lessons: datasets.flatMap((d) => d.lessons),
    lessonSeries: datasets.flatMap((d) => d.lessonSeries),
    attendances: datasets.flatMap((d) => d.attendances),
    makeupRequests: datasets.flatMap((d) => d.makeupRequests),
    payments: datasets.flatMap((d) => d.payments),
    teacherFeeRules: datasets.flatMap((d) => d.teacherFeeRules),
    teacherPayouts: datasets.flatMap((d) => d.teacherPayouts),
    // Politika kurum bazlıdır — birleşik görünümde her kayıt kendi kurumunun öğretmenleriyle sınırlanır.
    teacherPayoutPolicies: datasets.flatMap((d) =>
      (d.teacherPayoutPolicies ?? []).map((p) => ({ ...p, teacherIds: d.teachers.map((t) => t.id) }))
    ),
  };
}
