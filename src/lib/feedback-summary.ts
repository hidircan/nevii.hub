/**
 * Karşılıklı Değerlendirmeler — AI özeti için deterministik ön-hesaplama
 * (bkz. `teacherPerformanceScore`/`attendanceRiskAssessment` ile AYNI ilke:
 * skor/istatistik LLM'DEN ÖNCE, LLM'siz hesaplanır; LLM yalnız yorumlar).
 *
 * Gizlilik: bu modülün çıktısı LLM'e giden TEK veri kaynağıdır — hiçbir ham
 * yorum metni, isim, telefon, `studentId`/`submittedBy` gibi ham tanımlayıcı
 * içermez. `themes` yalnızca kelime frekansı (tek kelime, bağlamsız) —
 * cümle/yorum asla kelimesi kelimesine taşınmaz.
 */

const STOPWORDS = new Set([
  "bir", "bu", "şu", "ve", "ile", "için", "çok", "daha", "gibi", "ama", "ancak",
  "de", "da", "ki", "mi", "mu", "mü", "ne", "her", "en", "olarak", "olan",
  "veya", "ya", "hem", "yok", "var", "değil", "biraz", "sadece", "kendi",
]);

export type FeedbackSummaryStats = {
  responseCount: number;
  eligible: boolean;
  criteriaAverages: Record<string, number>;
  commentCount: number;
  /** Basit kelime-frekansı temaları — ham yorum/cümle değil. */
  themes: string[];
};

export const FEEDBACK_SUMMARY_MIN_RESPONSES = 3;

function extractThemes(comments: string[], limit = 5): string[] {
  const freq = new Map<string, number>();
  for (const comment of comments) {
    const words = comment
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
    for (const w of words) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  return Array.from(freq.entries())
    .filter(([, count]) => count >= 2) // yalnız TEKRARLAYAN (tek yorumluk gürültü değil) temalar
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

/**
 * `rows`: bir öğretmen VEYA bir öğrenci kapsamındaki, tenant-scoped, zaten
 * yetki kontrolünden geçmiş kayıtlar. `criteriaKeys` sabit kriter listesi
 * (TEACHER_FEEDBACK_CRITERIA veya STUDENT_FEEDBACK_CRITERIA'nın key'leri).
 */
export function computeFeedbackSummaryStats(
  rows: { scores: Record<string, number>; comment?: string }[],
  criteriaKeys: string[]
): FeedbackSummaryStats {
  const responseCount = rows.length;
  const eligible = responseCount >= FEEDBACK_SUMMARY_MIN_RESPONSES;
  if (!eligible) {
    return { responseCount, eligible: false, criteriaAverages: {}, commentCount: 0, themes: [] };
  }

  const criteriaAverages: Record<string, number> = {};
  for (const key of criteriaKeys) {
    const sum = rows.reduce((s, r) => s + (r.scores[key] ?? 0), 0);
    criteriaAverages[key] = Math.round((sum / responseCount) * 10) / 10;
  }

  const comments = rows.map((r) => r.comment).filter((c): c is string => Boolean(c && c.trim()));
  const themes = extractThemes(comments);

  return { responseCount, eligible: true, criteriaAverages, commentCount: comments.length, themes };
}

/** AI başarısız/yoksa (veya heuristic moddaysa) kullanılan deterministik metin — AI uydurması yapmaz. */
export function formatDeterministicFeedbackSummary(
  stats: FeedbackSummaryStats,
  criteriaLabels: Record<string, string>
): string {
  if (!stats.eligible) {
    return `Anlamlı anonim/genel özet için en az ${FEEDBACK_SUMMARY_MIN_RESPONSES} değerlendirme gerekir (şu an: ${stats.responseCount}).`;
  }
  const avgLines = Object.entries(stats.criteriaAverages)
    .map(([key, avg]) => `${criteriaLabels[key] ?? key}: ${avg}/5`)
    .join(", ");
  const themeLine = stats.themes.length > 0 ? stats.themes.join(", ") : "belirgin bir tekrar eden tema yok";
  return [
    "Genel eğilim",
    `${stats.responseCount} değerlendirme üzerinden kriter ortalamaları: ${avgLines || "veri yok"}.`,
    "",
    "Güçlü yönler",
    "En yüksek ortalamalı kriterler güçlü yön olarak değerlendirilebilir.",
    "",
    "Dikkat edilmesi gerekenler",
    "En düşük ortalamalı kriterler yakından takip edilmelidir.",
    "",
    "Tekrarlayan temalar",
    themeLine,
    "",
    "Önerilen yönetici aksiyonu",
    stats.commentCount > 0
      ? "Paylaşılan yorumları gözden geçirip gerekirse ilgili tarafla görüşme planlayın."
      : "Yeterli yorum yok; birkaç değerlendirme daha biriktikten sonra tekrar değerlendirin.",
  ].join("\n");
}
