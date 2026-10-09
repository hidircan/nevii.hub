/**
 * PII-safe maliyet metriği — Vercel/Supabase kota görünürlüğü.
 *
 * Sözleşme:
 * - YALNIZ agregalar: method, route şablonu (kimlikler maskelenmiş), status,
 *   süre, yanıt baytı, cache isabeti, örnekleme bayrağı. Token, isim, e-posta,
 *   telefon, ham kimlik, body, query değeri ASLA taşınmaz.
 * - `normalizeRouteTemplate`: path segmentlerindeki kimlik/UUID/sayısal
 *   değerleri `:id`'ye indirger — yüksek-kardinalite etiket yok.
 * - Örnekleme: varsayılan %10 + (yavaş >1sn | 5xx) her zaman. Oran
 *   `COST_METRICS_SAMPLE_RATE` ile [0,1] aralığında ayarlanır.
 */

export const COST_METRIC_SLOW_MS = 1_000;
export const DEFAULT_COST_SAMPLE_RATE = 0.1;

export type CostMetric = {
  /** Sabit etiket: log taraması için `cost_metric`. */
  kind: "cost_metric";
  method: string;
  /** Kimlik-maskeli route şablonu, örn. `/api/v1/students/:id/schedule`. */
  route: string;
  status: number;
  /** Uçtan uca handler süresi (ms). */
  durationMs: number;
  /** JSON yanıt tahmini baytı; ölçülemediyse -1 (özel NextResponse). */
  responseBytes: number;
  /** Sunucu cache isabeti (özet uçları; bilinmiyorsa false). */
  cached: boolean;
  /** Bu kayıt örnekleme dışı zorunlu mu (yavaş/5xx)? */
  forced: boolean;
};

const ID_SEGMENT = /^[0-9a-fA-F-]{8,}$|^\d+$|^uid_[A-Za-z0-9_-]+$/;

/** Bu koleksiyon adını takip eden segment HER ZAMAN kimliktir (kısa `s1` dahil). */
const COLLECTION_NOUNS = new Set([
  "students",
  "teachers",
  "users",
  "lessons",
  "payments",
  "homework",
  "homework-submissions",
  "tasks",
  "task-attachments",
  "branches",
  "rooms",
  "contracts",
  "documents",
  "teaching-materials",
  "announcements",
  "assessments",
  "periodic-assessments",
  "teachers",
  "notifications",
  "notification-preferences",
  "devices",
  "leave",
  "trials",
  "invitations",
  "messages",
  "instruments",
  "makeup",
]);

/**
 * Path'i düşük-kardinalite şablona indirger. Query DAHİL EDİLMEZ (PII/filter
 * değerleri sızmaz). Kimlik tespiti: desen + koleksiyon-konumu çift katmanlı.
 */
export function normalizeRouteTemplate(pathname: string): string {
  const clean = pathname.split("?")[0] ?? pathname;
  const parts = clean.split("/");
  return (
    parts
      .map((seg, i) => {
        if (!seg) return seg;
        if (seg.includes(".") && seg.length <= 64) return ":file";
        if (ID_SEGMENT.test(seg)) return ":id";
        const prev = parts[i - 1] ?? "";
        if (COLLECTION_NOUNS.has(prev)) return ":id";
        if (seg.length > 40) return ":id";
        return seg;
      })
      .join("/") || "/"
  );
}

/** Örnekleme kararı: `random` enjekte edilebilir (testler). */
export function shouldSampleCostMetric(sampleRate: number, random: () => number = Math.random): boolean {
  if (!(sampleRate > 0)) return false;
  if (sampleRate >= 1) return true;
  return random() < sampleRate;
}

/** Env'den oran okur (geçersizse varsayılan; değer loglanmaz). */
export function costSampleRateFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.COST_METRICS_SAMPLE_RATE;
  if (raw === undefined || raw === "") return DEFAULT_COST_SAMPLE_RATE;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return DEFAULT_COST_SAMPLE_RATE;
  return n;
}

export function buildCostMetric(input: {
  method: string;
  pathname: string;
  status: number;
  durationMs: number;
  responseBytes: number;
  cached?: boolean;
  forced?: boolean;
}): CostMetric {
  return {
    kind: "cost_metric",
    method: input.method.toUpperCase().slice(0, 8),
    route: normalizeRouteTemplate(input.pathname),
    status: input.status,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    responseBytes: input.responseBytes,
    cached: input.cached ?? false,
    forced: input.forced ?? false,
  };
}

/** Tek-satır JSON log formatı (Vercel log drain / Supabase log taraması uyumlu). */
export function formatCostMetric(metric: CostMetric): string {
  return JSON.stringify(metric);
}

/**
 * ServiceResult JSON zarfının tahmini baytı (ölçülen değer metrikte taşınır,
 * içerik ASLA loglanmaz). Ölçülemezse -1.
 */
export function estimateServiceResultBytes(
  result: { ok: boolean; data?: unknown; error?: unknown }
): number {
  try {
    const envelope = result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
    return Buffer.byteLength(JSON.stringify(envelope), "utf8");
  } catch {
    return -1;
  }
}
