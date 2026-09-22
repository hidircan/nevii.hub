/**
 * Kurum sahibi performans ağırlıkları.
 *
 * Ağırlıklar yüzde puanıdır (0–100). 0 = metrik pasif.
 * Kayıtlı toplam 100 olmak zorundadır; aksi kayıt reddedilir.
 * Kayıt yoksa ürün varsayılanı kullanılır (toplamı 100).
 */

export type PerformanceMetricDefinition = {
  key: string;
  label: string;
  /** Yeni metrik eklenebilir; bilinmeyen anahtarlar yok sayılır. */
  audience: "teacher" | "staff";
};

export const TEACHER_PERFORMANCE_METRICS: PerformanceMetricDefinition[] = [
  { key: "attendance", label: "Yoklama", audience: "teacher" },
  { key: "feedback", label: "Geri bildirim", audience: "teacher" },
  { key: "tasks", label: "İş takip", audience: "teacher" },
  { key: "homework", label: "Ödev", audience: "teacher" },
  { key: "enrollmentFromSchedule", label: "Planlanan dersten yeni öğrenci kaydı", audience: "teacher" },
];

export const STAFF_PERFORMANCE_METRICS: PerformanceMetricDefinition[] = [
  { key: "tasks", label: "Görev tamamlama", audience: "staff" },
  { key: "onTime", label: "Zamanında tamamlama", audience: "staff" },
  { key: "collections", label: "Tahsilat", audience: "staff" },
  { key: "newStudents", label: "Yeni öğrenci kaydı", audience: "staff" },
  { key: "lessonsPlanned", label: "Planlanan ders", audience: "staff" },
];

export type PerformanceWeightsConfig = {
  teacher: Record<string, number>;
  staff: Record<string, number>;
};

export const DEFAULT_PERFORMANCE_WEIGHTS: PerformanceWeightsConfig = {
  teacher: {
    attendance: 28,
    feedback: 24,
    tasks: 19,
    homework: 24,
    enrollmentFromSchedule: 5,
  },
  staff: {
    tasks: 35,
    onTime: 25,
    collections: 25,
    newStudents: 10,
    lessonsPlanned: 5,
  },
};

export function defaultWeightsFor(audience: "teacher" | "staff"): Record<string, number> {
  return { ...DEFAULT_PERFORMANCE_WEIGHTS[audience] };
}

export type WeightValidation =
  | { ok: true; weights: Record<string, number> }
  | { ok: false; message: string };

/** Bilinmeyen anahtar düşer. 0 pasif. Toplam tam 100 olmalı. */
export function validateWeightMap(
  audience: "teacher" | "staff",
  input: Record<string, number> | undefined | null
): WeightValidation {
  const catalog = audience === "teacher" ? TEACHER_PERFORMANCE_METRICS : STAFF_PERFORMANCE_METRICS;
  const source = input ?? defaultWeightsFor(audience);
  const weights: Record<string, number> = {};
  for (const metric of catalog) {
    const raw = source[metric.key];
    const value = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : 0;
    if (value < 0 || value > 100) {
      return { ok: false, message: `${metric.label} ağırlığı 0 ile 100 arasında olmalı.` };
    }
    weights[metric.key] = value;
  }
  const total = Object.values(weights).reduce((s, n) => s + n, 0);
  if (total !== 100) {
    return {
      ok: false,
      message: `Ağırlıkların toplamı 100 olmalı. Şu an ${total}. 0, metriği kapatır.`,
    };
  }
  return { ok: true, weights };
}

export function resolvePerformanceWeights(
  stored: PerformanceWeightsConfig | null | undefined
): { teacher: Record<string, number>; staff: Record<string, number> } {
  const teacher = validateWeightMap("teacher", stored?.teacher);
  const staff = validateWeightMap("staff", stored?.staff);
  return {
    teacher: teacher.ok ? teacher.weights : defaultWeightsFor("teacher"),
    staff: staff.ok ? staff.weights : defaultWeightsFor("staff"),
  };
}

/**
 * Verisi olan bileşenleri, 0 olmayan ağırlıklarla 1'e normalize eder.
 * Ağırlığı 0 olan metrik skora girmez.
 */
export function weightedScore(
  parts: { key: string; normalized: number | null; weightPercent: number }[]
): { score: number | null; contributions: Record<string, number | null> } {
  const present = parts.filter((p) => p.normalized !== null && p.weightPercent > 0);
  const contributions: Record<string, number | null> = {};
  for (const p of parts) contributions[p.key] = null;
  if (present.length === 0) return { score: null, contributions };
  const total = present.reduce((s, p) => s + p.weightPercent, 0);
  let score = 0;
  for (const p of present) {
    const contribution = ((p.normalized ?? 0) * p.weightPercent) / total;
    contributions[p.key] = Math.round(contribution * 10) / 10;
    score += contribution;
  }
  return { score: Math.round(score), contributions };
}
