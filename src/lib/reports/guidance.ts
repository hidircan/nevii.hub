/**
 * Öğretmen Raporları Rehberlik ve 4 Derslik Otomatik Özet Motoru.
 *
 * Web (`/gelisim`, `/ogretmen/**`, `/panel/raporlar`) ve mobil (`apps/mobile`)
 * aynı alan rehberliğini (placeholder), puan ölçeğini ve 4 derslik otomatik
 * özet/sentez kurgusunu paylaşır.
 */

import { computeOverallScore } from "../assessment/score";
import type { AssessmentScores, Lesson, LessonAssessment, PeriodicLessonSummaryItem } from "../types";

export const DEFAULT_ASSESSMENT_SCORES: AssessmentScores = {
  teknikBecerisi: 3,
  notaOkuma: 3,
  muzikalite: 3,
  ritimDuyusu: 3,
  calismaDuzeni: 3,
  evOdeviTamamlama: 3,
  dersKatilimi: 3,
  motivasyon: 3,
  genelIlerleme: 3,
  hedefeUlasma: 3,
};

export const SCORE_CRITERIA_KEYS: (keyof AssessmentScores)[] = [
  "teknikBecerisi",
  "notaOkuma",
  "muzikalite",
  "ritimDuyusu",
  "calismaDuzeni",
  "evOdeviTamamlama",
  "dersKatilimi",
  "motivasyon",
  "genelIlerleme",
  "hedefeUlasma",
];

/**
 * Ders bazlı gelişim raporu (`LessonAssessment`) metin kutuları için
 * bağlama özel, pedagojik ve doğal örnek cümleler (placeholder).
 * Yalnızca görsel referanstır; form değerini otomatik doldurmaz.
 */
export const LESSON_REPORT_PLACEHOLDERS = {
  strengthNote:
    "Örn: Sağ el parmak pozisyonunu ders boyunca korudu; yeni gam çalışmasında tempo bütünlüğünü çok hızlı kavradı.",
  improvementNote:
    "Örn: Ölçü geçişlerinde sol el akor değişimlerinde kısa duraksamalar oluyor; yavaş tempoda bağ çalışması gerekiyor.",
  nextStepsNote:
    "Örn: Gelecek derse kadar Minuet in G ilk 8 ölçüyü 60 BPM metronomla eller ayrı ve birleştirerek günde 15 dk çalışacak.",
  piecesWorked:
    "Örn: J.S. Bach — Minuet in G (1–16. ölçüler), Suzuki Kitap 1 No. 4",
  etudesWorked:
    "Örn: Czerny Op. 599 No. 12–14, Hanon 1–3. egzersizler",
  technicalWork:
    "Örn: Do Majör ve Sol Majör 2 oktav gam, arpej ve staccato/legato artikülasyon egzersizleri",
  theoryWork:
    "Örn: 3/4 ve 4/4 ölçü birimleri, dörtlük-sekizlik tartım okuma ve sol anahtarı deşifre çalışması",
  parentPrivateNote:
    "Örn: Evdeki çalışma saatlerini sabit bir rutine oturtursak motivasyonu ve ilerleme hızı çok daha artacaktır.",
} as const;

/**
 * 4 derslik / 4 haftalık genel gelişim raporu (`PeriodicAssessment`) metin kutuları
 * için bağlama özel, kurumsal ve pedagojik örnek cümleler (placeholder).
 */
export const PERIODIC_REPORT_PLACEHOLDERS = {
  overallProgressNote:
    "Örn: Son 4 derste temel oturuş, tuşe kontrolü ve ritim istikrarında belirgin bir ilerleme kaydedildi. Ders içi odaklanması yüksek ve verilen çalışmaları düzenli takip ediyor.",
  strengthsNote:
    "Örn: Kulak duyumu, ritim tekrarı ve ders içi uygulama isteği oldukça güçlü; yeni konuları hızlı içselleştiriyor.",
  areasForImprovementNote:
    "Örn: Nota okuma hızı ve uzun pasajlarda tempo sabitliği üzerinde düzenli metronom tekrarı yapılmalı.",
  recommendationNote:
    "Örn: Haftada en az 4 gün 20'şer dakikalık bölünmüş pratik rutini uygulanmasını ve etütlerin yavaş tempoda tekrar edilmesini öneririm.",
} as const;

export interface PeriodicAssessmentDraft {
  lessonCount: number;
  assessedLessonCount: number;
  attendedLessonCount: number;
  relatedLessonIds: string[];
  lessonSummaries: PeriodicLessonSummaryItem[];
  suggestedScores: AssessmentScores;
  overallScore: number;
  topicsSummary: {
    piecesWorked: string[];
    etudesWorked: string[];
    technicalWork: string[];
    theoryWork: string[];
  };
  synthesizedNotes: {
    overallProgressNote: string;
    strengthsNote: string;
    areasForImprovementNote: string;
    recommendationNote: string;
  };
}

function uniqueCleanLines(values: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) continue;
    const norm = trimmed.toLocaleLowerCase("tr");
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(trimmed);
  }
  return out;
}

function joinBulletSentences(items: string[], maxItems = 4): string {
  const slice = items.slice(0, maxItems);
  if (slice.length === 0) return "";
  if (slice.length === 1) return slice[0]!;
  return slice.map((line) => (line.endsWith(".") ? line : `${line}.`)).join(" ");
}

export type PeriodicDraftAssessmentInput = Pick<
  LessonAssessment,
  | "id"
  | "lessonId"
  | "createdAt"
  | "piecesWorked"
  | "etudesWorked"
  | "technicalWork"
  | "theoryWork"
  | "strengthNote"
  | "improvementNote"
  | "nextStepsNote"
> &
  AssessmentScores;

/**
 * 4 derslik / 4 haftalık dönem içindeki dersleri ve o derslerde girilmiş
 * `LessonAssessment` verilerini toplayarak öğretmenin önüne hazır bir
 * kontrol/özet paketi (`PeriodicAssessmentDraft`) çıkarır.
 */
export function buildPeriodicAssessmentDraft(params: {
  lessons: Pick<
    Lesson,
    "id" | "studentId" | "teacherId" | "startAt" | "instrument" | "status" | "studentAttended" | "lessonProcessed"
  >[];
  assessments: PeriodicDraftAssessmentInput[];
  periodStart: string;
  periodEnd: string;
}): PeriodicAssessmentDraft {
  const startMs = Date.parse(params.periodStart);
  const endMs = Date.parse(params.periodEnd);

  const nonCancelled = params.lessons
    .filter((l) => l.status !== "cancelled")
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  const inWindow = nonCancelled.filter((l) => {
    const t = Date.parse(l.startAt);
    return t >= startMs && t <= endMs;
  });

  // Dönem içinde ders varsa son 4 dersi, yoksa periodEnd öncesindeki son 4 dersi baz al.
  const selectedLessons =
    inWindow.length > 0
      ? inWindow.slice(-4)
      : nonCancelled.filter((l) => Date.parse(l.startAt) <= endMs).slice(-4);

  const assessmentByLessonId = new Map<string, PeriodicDraftAssessmentInput>();
  for (const a of params.assessments) {
    assessmentByLessonId.set(a.lessonId, a);
  }

  // Dönemdeki derslerin değerlendirmeleri; eğer ders ID eşleşmesi dışında dönemde yazılmış değerlendirme varsa onları da yakala.
  const matchedAssessments: PeriodicDraftAssessmentInput[] = [];
  const usedAssessmentIds = new Set<string>();

  const lessonSummaries: PeriodicLessonSummaryItem[] = selectedLessons.map((l) => {
    const a = assessmentByLessonId.get(l.id);
    if (a && !usedAssessmentIds.has(a.id)) {
      usedAssessmentIds.add(a.id);
      matchedAssessments.push(a);
    }
    return {
      lessonId: l.id,
      startAt: l.startAt,
      instrument: l.instrument,
      status: l.status,
      assessed: Boolean(a),
      overallScore: a ? Number(computeOverallScore(a).toFixed(1)) : undefined,
      piecesWorked: a?.piecesWorked,
      etudesWorked: a?.etudesWorked,
      technicalWork: a?.technicalWork,
      theoryWork: a?.theoryWork,
      strengthNote: a?.strengthNote,
      improvementNote: a?.improvementNote,
      nextStepsNote: a?.nextStepsNote,
    };
  });

  if (matchedAssessments.length === 0) {
    const windowAssessments = params.assessments
      .filter((a) => {
        const t = Date.parse(a.createdAt);
        return t >= startMs && t <= endMs + 7 * 86_400_000;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-4);
    for (const a of windowAssessments) {
      if (!usedAssessmentIds.has(a.id)) {
        usedAssessmentIds.add(a.id);
        matchedAssessments.push(a);
      }
    }
  }

  const suggestedScores: AssessmentScores = { ...DEFAULT_ASSESSMENT_SCORES };
  if (matchedAssessments.length > 0) {
    for (const key of SCORE_CRITERIA_KEYS) {
      const avg =
        matchedAssessments.reduce((sum, a) => sum + (Number(a[key]) || 3), 0) /
        matchedAssessments.length;
      suggestedScores[key] = Math.min(5, Math.max(1, Math.round(avg)));
    }
  }

  const overallScore = Number(computeOverallScore(suggestedScores).toFixed(1));

  const topicsSummary = {
    piecesWorked: uniqueCleanLines(matchedAssessments.map((a) => a.piecesWorked)),
    etudesWorked: uniqueCleanLines(matchedAssessments.map((a) => a.etudesWorked)),
    technicalWork: uniqueCleanLines(matchedAssessments.map((a) => a.technicalWork)),
    theoryWork: uniqueCleanLines(matchedAssessments.map((a) => a.theoryWork)),
  };

  const strengthsList = uniqueCleanLines(matchedAssessments.map((a) => a.strengthNote));
  const improvementsList = uniqueCleanLines(matchedAssessments.map((a) => a.improvementNote));
  const nextStepsList = uniqueCleanLines(matchedAssessments.map((a) => a.nextStepsNote));

  const strengthsNote = joinBulletSentences(strengthsList);
  const areasForImprovementNote = joinBulletSentences(improvementsList);
  const recommendationNote = joinBulletSentences(nextStepsList);

  const attendedLessonCount = selectedLessons.filter(
    (l) => l.status === "completed" || l.studentAttended || l.lessonProcessed
  ).length;

  const workedTopicsParts: string[] = [];
  if (topicsSummary.piecesWorked.length > 0) {
    workedTopicsParts.push(`Eserler: ${topicsSummary.piecesWorked.join(", ")}`);
  }
  if (topicsSummary.etudesWorked.length > 0) {
    workedTopicsParts.push(`Etütler: ${topicsSummary.etudesWorked.join(", ")}`);
  }
  if (topicsSummary.technicalWork.length > 0) {
    workedTopicsParts.push(`Teknik: ${topicsSummary.technicalWork.join(", ")}`);
  }
  if (topicsSummary.theoryWork.length > 0) {
    workedTopicsParts.push(`Teori: ${topicsSummary.theoryWork.join(", ")}`);
  }

  let overallProgressNote = "";
  if (matchedAssessments.length > 0) {
    const baseSentence = `Bu 4 derslik dönemde ${selectedLessons.length || matchedAssessments.length} ders işlenmiş ve ${matchedAssessments.length} ders değerlendirmesi üzerinden dönem ortalaması ${overallScore.toFixed(1)}/5 olarak gerçekleşmiştir.`;
    const topicSentence =
      workedTopicsParts.length > 0 ? ` Dönem boyunca çalışılan başlıca içerikler: ${workedTopicsParts.join(" · ")}.` : "";
    const highlightSentence = strengthsList[0]
      ? ` Öne çıkan gelişim: ${strengthsList[0].endsWith(".") ? strengthsList[0] : `${strengthsList[0]}.`}`
      : "";
    overallProgressNote = `${baseSentence}${topicSentence}${highlightSentence}`.trim();
  }

  return {
    lessonCount: selectedLessons.length,
    assessedLessonCount: matchedAssessments.length,
    attendedLessonCount,
    relatedLessonIds: selectedLessons.map((l) => l.id),
    lessonSummaries,
    suggestedScores,
    overallScore,
    topicsSummary,
    synthesizedNotes: {
      overallProgressNote,
      strengthsNote,
      areasForImprovementNote,
      recommendationNote,
    },
  };
}
