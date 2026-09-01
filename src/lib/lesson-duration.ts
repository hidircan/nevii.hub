/**
 * Ders süresi sabitleri — tek doğrulama/varsayılan kaynağı. `Student.
 * lessonDurationMinutes` (types.ts `LessonDurationPreference`) ve ders/paket
 * fiyatlandırma akışlarının (Package.price30Min/40Min/50Min) hepsi aynı
 * sabit üç değeri (30/40/50 dk) kullanır — deneme dersleri (trial lesson)
 * AYRI ve DAHA KÜÇÜK bir sabit kümeye tabidir (bkz. TRIAL_LESSON_DURATION_OPTIONS
 * altında), o yüzden bu modülün normal-ders kısmı yalnızca DÜZENLİ ders/paket
 * akışları içindir.
 */

export const LESSON_DURATION_OPTIONS = [30, 40, 50] as const;
export type LessonDurationMinutes = (typeof LESSON_DURATION_OPTIONS)[number];

/** Paket/ders formlarında varsayılan seçili süre. */
export const DEFAULT_LESSON_DURATION_MINUTES: LessonDurationMinutes = 40;

/**
 * Deneme dersi (trial lesson) süre sabitleri — KESİN İŞ KURALI (2026-09-01
 * revizyonu): deneme dersleri öğretmenlerin ders araları için planlanır ve
 * yalnızca 10, 15 veya 20 dakika olabilir. Normal ders serisinin 30/40/50 dk
 * seçenekleriyle (yukarıdaki LESSON_DURATION_OPTIONS) KARIŞTIRILMAMALI —
 * bu iki küme birbirinden bağımsızdır ve biri diğerini etkilemez. 20
 * dakikadan uzun bir deneme dersi ASLA kabul edilmemelidir; doğrulama
 * yalnızca istemciye (UI select) bırakılmaz, backend/API bu kuralı
 * (bkz. validation.ts createTrialLessonSchema) bağımsız olarak uygular.
 */
export const TRIAL_LESSON_DURATION_OPTIONS = [10, 15, 20] as const;
export type TrialLessonDurationMinutes = (typeof TRIAL_LESSON_DURATION_OPTIONS)[number];

/** Deneme dersi formlarında varsayılan seçili süre. */
export const DEFAULT_TRIAL_LESSON_DURATION_MINUTES: TrialLessonDurationMinutes = 15;
