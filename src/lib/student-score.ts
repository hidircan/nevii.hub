/**
 * Öğrenci genel skoru — 4 bileşenli, şeffaf/açıklanabilir rapor.
 * `teacher-performance-v2.ts` ile AYNI mimari desen (ayrı ağırlıklı
 * bileşenler, veri yoksa o bileşen ağırlığı SIFIR sayılmaz — kalan mevcut
 * bileşenlerin ağırlıkları toplam 1'e gelecek şekilde yeniden normalize
 * edilir).
 *
 * Onaylanmış ağırlıklar (kurum politikası — eşit dağılım DEĞİL):
 * yoklama %30, ödev tamamlama/zamanında teslim %25, müfredat ilerlemesi
 * %20, öğretmen değerlendirmesi %25.
 *
 * "Yetersiz veri" eşiği: ANLAMLI (hasData:true) bileşen sayısı 2'DEN AZSA
 * (0 veya 1) skor `null` döner — tek bir bileşene dayanan bir sayı, kaç
 * doğru veri noktasına dayandığını gizleyen yanıltıcı bir kesinlik
 * izlenimi verir (bkz. combineComponents).
 *
 * KURAL (zorunlu): hiçbir bileşen mazeretli devamsızlığı, onaylı telafiyi
 * veya "henüz işaretlenmemiş/veri yok" durumunu CEZALANDIRMAZ — bu durumlar
 * ilgili bileşenin PAYDASINDAN tamamen ÇIKARILIR (ne olumlu ne olumsuz
 * sayılır), ceza olarak sıfırlanmaz.
 *
 * Tarih penceresi: çağıran tarafın verdiği [periodStart, periodEnd] —
 * varsayılan (bkz. tools.ts defaultScorePeriod) son 90 gündür. Yoklama/ödev/
 * öğretmen değerlendirmesi bileşenleri bu pencereye göre filtrelenir.
 * Müfredat/konu ilerlemesi İSTİSNADIR: bu bir olay günlüğü değil,
 * ÖĞRENCİNİN GÜNCEL DURUMUNUN anlık görüntüsüdür — dönem penceresine göre
 * filtrelenmez, her zaman öğrencinin o anki tüm konuları üzerinden
 * hesaplanır (bkz. computeCurriculumComponent).
 */
import type { AppData, Homework, HomeworkSubmission, Lesson, LessonAssessment, StudentCurriculumTopic } from "./types";
import { effectiveLessonOpsStatus } from "./lesson-ops";
import { listHomeworkForStudent, listAllHomeworkSubmissions } from "./homework";
import { listCurriculumTopicsForStudent, computeOverallCurriculumProgress } from "./curriculum";
import { listAssessmentsForStudent } from "./assessment";
import { computeOverallScore } from "./assessment/score";

export const STUDENT_SCORE_VERSION = "student-score-v1";

/** Onaylanmış kurum politikası — eşit ağırlık DEĞİL, bkz. modül başı açıklama. */
export const STUDENT_SCORE_WEIGHTS = {
  attendance: 0.3,
  homework: 0.25,
  curriculum: 0.2,
  teacherAssessment: 0.25,
} as const;

/** Bu sayıdan AZ anlamlı (hasData:true) bileşen varsa toplam skor null'dur ("Yetersiz veri"). */
const MIN_MEANINGFUL_COMPONENTS = 2;

type ComponentKey = keyof typeof STUDENT_SCORE_WEIGHTS;

export type StudentScoreComponent = {
  weight: number;
  /** Bu bileşen için yeterli veri var mı (false ⇒ tüm alanlar null, ceza YOK — ağırlık yeniden dağıtılır). */
  hasData: boolean;
  rawValue: number | null;
  /** 0–100'e normalize edilmiş değer. */
  normalizedValue: number | null;
  /** Toplam skora katkısı (0–100 ölçeğinde, yeniden-normalize edilmiş ağırlıkla). */
  contribution: number | null;
};

export type AttendanceScoreComponent = StudentScoreComponent & {
  countedLessonCount: number;
  attendedCount: number;
  absentCount: number;
  /** Cezalandırılmaz — sayaç bilgi amaçlı, paydaya dahil DEĞİL. */
  excusedOrMakeupCount: number;
  /** Henüz Geldi/İşlendi/Gelmedi/İzinli/Telafi olarak işaretlenmemiş — cezalandırılmaz, paydaya dahil DEĞİL. */
  unmarkedCount: number;
};

export type HomeworkScoreComponent = StudentScoreComponent & {
  totalCount: number;
  completedCount: number;
  onTimeCount: number;
  completionRate: number | null;
  onTimeRate: number | null;
};

export type CurriculumScoreComponent = StudentScoreComponent & {
  topicCount: number;
  masteredCount: number;
  inProgressCount: number;
  deferredCount: number;
};

export type TeacherAssessmentScoreComponent = StudentScoreComponent & {
  assessmentCount: number;
};

export type StudentScoreReport = {
  version: string;
  studentId: string;
  periodStart: string;
  periodEnd: string;
  /** null = tüm bileşenler verisiz ("Yetersiz veri") — punitif bir 0 DEĞİL. */
  score: number | null;
  components: {
    attendance: AttendanceScoreComponent;
    homework: HomeworkScoreComponent;
    curriculum: CurriculumScoreComponent;
    teacherAssessment: TeacherAssessmentScoreComponent;
  };
};

function inRange(iso: string, startMs: number, endMs: number): boolean {
  const t = new Date(iso).getTime();
  return t >= startMs && t <= endMs;
}

function computeAttendanceComponent(
  lessons: Lesson[],
  rangeStart: number,
  rangeEnd: number
): AttendanceScoreComponent {
  const inWindow = lessons.filter((l) => l.status !== "cancelled" && inRange(l.startAt, rangeStart, rangeEnd));

  let attendedCount = 0;
  let absentCount = 0;
  let excusedOrMakeupCount = 0;
  let unmarkedCount = 0;

  for (const l of inWindow) {
    const ops = effectiveLessonOpsStatus(l);
    if (ops === "attended" || ops === "processed") attendedCount++;
    else if (ops === "absent") absentCount++;
    else if (ops === "excused" || ops === "makeup") excusedOrMakeupCount++;
    else unmarkedCount++;
  }

  const countedLessonCount = attendedCount + absentCount;
  const rate = countedLessonCount > 0 ? attendedCount / countedLessonCount : null;

  return {
    weight: STUDENT_SCORE_WEIGHTS.attendance,
    hasData: rate !== null,
    rawValue: rate,
    normalizedValue: rate !== null ? rate * 100 : null,
    contribution: null,
    countedLessonCount,
    attendedCount,
    absentCount,
    excusedOrMakeupCount,
    unmarkedCount,
  };
}

function computeHomeworkComponent(
  homework: Homework[],
  submissionsByHomeworkId: Map<string, HomeworkSubmission[]>,
  rangeStart: number,
  rangeEnd: number
): HomeworkScoreComponent {
  const inWindow = homework.filter((h) => inRange(h.dueDate, rangeStart, rangeEnd));

  let completedCount = 0;
  let onTimeCount = 0;
  for (const h of inWindow) {
    const submissions = submissionsByHomeworkId.get(h.id) ?? [];
    if (submissions.length === 0) continue;
    completedCount++;
    const submittedOnTime = submissions.some((s) => s.submittedAt.slice(0, 10) <= h.dueDate.slice(0, 10));
    if (submittedOnTime) onTimeCount++;
  }

  const totalCount = inWindow.length;
  const completionRate = totalCount > 0 ? completedCount / totalCount : null;
  const onTimeRate = totalCount > 0 ? onTimeCount / totalCount : null;
  // Öncelik: zamanında teslim oranı (tasks bileşeniyle aynı desen — teacher-performance-v2.ts); veri yoksa tamamlanma oranına düşer.
  const normalizedValue = onTimeRate !== null ? onTimeRate * 100 : completionRate !== null ? completionRate * 100 : null;

  return {
    weight: STUDENT_SCORE_WEIGHTS.homework,
    hasData: totalCount > 0,
    rawValue: onTimeRate ?? completionRate,
    normalizedValue,
    contribution: null,
    totalCount,
    completedCount,
    onTimeCount,
    completionRate,
    onTimeRate,
  };
}

/** Dönem penceresine göre FİLTRELENMEZ — bkz. modül başı açıklama. */
function computeCurriculumComponent(topics: StudentCurriculumTopic[]): CurriculumScoreComponent {
  const masteredCount = topics.filter((t) => t.status === "mastered").length;
  const inProgressCount = topics.filter((t) => t.status === "in_progress").length;
  const deferredCount = topics.filter((t) => t.status === "deferred").length;

  const overallPercent = topics.length > 0 ? computeOverallCurriculumProgress(topics) : null;

  return {
    weight: STUDENT_SCORE_WEIGHTS.curriculum,
    hasData: overallPercent !== null,
    rawValue: overallPercent,
    normalizedValue: overallPercent,
    contribution: null,
    topicCount: topics.length,
    masteredCount,
    inProgressCount,
    deferredCount,
  };
}

function computeTeacherAssessmentComponent(
  assessments: LessonAssessment[],
  rangeStart: number,
  rangeEnd: number
): TeacherAssessmentScoreComponent {
  const inWindow = assessments.filter((a) => inRange(a.createdAt, rangeStart, rangeEnd));
  const average =
    inWindow.length > 0 ? inWindow.reduce((sum, a) => sum + computeOverallScore(a), 0) / inWindow.length : null;
  // 1–5 ölçeği 0–100'e taşınır (teacher-performance-v2.ts ile aynı dönüşüm).
  const normalizedValue = average !== null ? ((average - 1) / 4) * 100 : null;

  return {
    weight: STUDENT_SCORE_WEIGHTS.teacherAssessment,
    hasData: average !== null,
    rawValue: average !== null ? Math.round(average * 10) / 10 : null,
    normalizedValue,
    contribution: null,
    assessmentCount: inWindow.length,
  };
}

function combineComponents(components: Record<ComponentKey, StudentScoreComponent>): number | null {
  const present = (Object.keys(components) as ComponentKey[]).filter((k) => components[k].hasData);
  // Tek (veya sıfır) bileşene dayanan bir sayı, kaç gerçek veri noktasına
  // dayandığını gizleyen yanıltıcı bir kesinlik verir — bu durumda hiçbir
  // contribution set edilmez, toplam skor "Yetersiz veri" (null) kalır.
  if (present.length < MIN_MEANINGFUL_COMPONENTS) return null;

  const totalWeight = present.reduce((s, k) => s + STUDENT_SCORE_WEIGHTS[k], 0);
  let score = 0;
  for (const k of present) {
    const effectiveWeight = STUDENT_SCORE_WEIGHTS[k] / totalWeight;
    const contribution = (components[k].normalizedValue ?? 0) * effectiveWeight;
    components[k].contribution = Math.round(contribution * 10) / 10;
    score += contribution;
  }
  return Math.round(score);
}

export async function computeStudentScore(
  data: AppData,
  tenantId: string,
  studentId: string,
  periodStart: string,
  periodEnd: string
): Promise<StudentScoreReport> {
  const rangeStart = new Date(periodStart).getTime();
  const rangeEnd = new Date(periodEnd + "T23:59:59").getTime();

  const lessons = data.lessons.filter((l) => l.studentId === studentId);
  const attendance = computeAttendanceComponent(lessons, rangeStart, rangeEnd);

  const homework = await listHomeworkForStudent(tenantId, studentId);
  const allSubmissions = await listAllHomeworkSubmissions(tenantId);
  const submissionsByHomeworkId = new Map<string, HomeworkSubmission[]>();
  for (const s of allSubmissions) {
    if (s.studentId !== studentId) continue;
    const list = submissionsByHomeworkId.get(s.homeworkId) ?? [];
    list.push(s);
    submissionsByHomeworkId.set(s.homeworkId, list);
  }
  const homeworkComponent = computeHomeworkComponent(homework, submissionsByHomeworkId, rangeStart, rangeEnd);

  const topics = await listCurriculumTopicsForStudent(tenantId, studentId);
  const curriculum = computeCurriculumComponent(topics);

  const assessments = await listAssessmentsForStudent(tenantId, studentId);
  const teacherAssessment = computeTeacherAssessmentComponent(assessments, rangeStart, rangeEnd);

  const components = { attendance, homework: homeworkComponent, curriculum, teacherAssessment };
  const score = combineComponents(components);

  return {
    version: STUDENT_SCORE_VERSION,
    studentId,
    periodStart,
    periodEnd,
    score,
    components,
  };
}

export type ScoreBand = "excellent" | "good" | "developing" | "insufficient_data";

/**
 * Yapıcı/olumlu sunum — punitif bir "sıralama" değil, bir ilerleme bandı.
 * Veli/öğrenci tarafında (ayarla açıksa) yalnızca bu üretilir, ham
 * sayısal skor/bileşen kırılımı ASLA gösterilmez (bkz.
 * toStudentFacingScoreView) — ham detay yalnızca öğretmen/admin görür.
 */
export function scoreBand(score: number | null): ScoreBand {
  if (score === null) return "insufficient_data";
  if (score >= 80) return "excellent";
  if (score >= 55) return "good";
  return "developing";
}

export const SCORE_BAND_LABELS: Record<ScoreBand, string> = {
  excellent: "Harika gidiyor",
  good: "İyi gidiyor",
  developing: "Gelişim alanı var",
  insufficient_data: "Henüz yeterli veri yok",
};

export type StudentFacingScoreView = {
  band: ScoreBand;
  label: string;
};

/** Veli/öğrenci portalına (ayar açıksa) yansıyan TEK görünüm — sayı/bileşen sızdırmaz. */
export function toStudentFacingScoreView(report: StudentScoreReport): StudentFacingScoreView {
  const band = scoreBand(report.score);
  return { band, label: SCORE_BAND_LABELS[band] };
}
