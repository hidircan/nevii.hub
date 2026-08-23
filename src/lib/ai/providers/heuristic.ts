/**
 * Offline fallback when no LLM API key is configured. Two distinct call
 * shapes reach this provider:
 *  1. Chat orchestrator (`plan`/`narrate` with real conversation messages
 *     and, after execution, real `toolResults`).
 *  2. Capability routes (`/api/ai/insights`, `/api/ai/collections` via
 *     `provider-bridge.ts`) — `narrate()` only, `toolResults` ALWAYS `[]`,
 *     the only signal is `userMessage` (`"<capability description>\n\n
 *     Bağlam: {json}"`, built by `provider-bridge.ts`/the routes). This
 *     file never invents data: every field it reads from that context JSON
 *     was put there by the calling page (see capability route call sites).
 */
import type { LlmProvider } from "../types";
import type { AgentToolName } from "../../agent/types";
import { AI_CAPABILITIES, type AiCapabilityId } from "../capabilities";
import { summarizeToolResults } from "../response-shaping";
import { formatMoney } from "../../utils";

type HeuristicIntent =
  | { kind: "tool"; tool: AgentToolName; input: unknown }
  | { kind: "needs_info"; message: string }
  | { kind: "no_match" };

// Sentence-initial question/time words that would otherwise look like a
// capitalized proper noun ("When is Can's lesson" → skip "When", take "Can").
const NAME_STOPWORDS = new Set([
  "ne", "kim", "nasıl", "bugün", "yarın", "ders", "dersi", "dersleri",
  "program", "programı", "when", "who", "how", "what", "is", "the", "lesson",
]);

/** Best-effort: first capitalized, non-stopword token in the ORIGINAL (cased) text. */
function extractNameCandidate(original: string): string | undefined {
  const tokens = original.match(/[A-Za-zÇĞİÖŞÜçğıöşü]+/g) || [];
  for (const token of tokens) {
    if (token.length < 2 || !/^[A-ZÇĞİÖŞÜ]/.test(token)) continue;
    if (NAME_STOPWORDS.has(token.toLocaleLowerCase("tr"))) continue;
    return token;
  }
  return undefined;
}

function detectIntent(text: string, allowed: Set<string>): HeuristicIntent {
  const t = text.toLowerCase();
  const canUse = (name: AgentToolName) => allowed.has(name);

  if (
    /(öğretmen|ogretmen|teacher).*(liste|bul|müsait|musait|available)|available teacher|list teachers/i.test(
      t
    )
  ) {
    if (!canUse("findAvailableTeachers")) return { kind: "no_match" };
    let instrument: string | undefined;
    if (t.includes("gitar")) instrument = "Gitar";
    if (t.includes("piyano")) instrument = "Piyano";
    if (t.includes("keman")) instrument = "Keman";
    if (t.includes("bateri")) instrument = "Bateri";
    if (t.includes("şan") || t.includes("vokal")) instrument = "Şan";
    if (t.includes("flüt") || t.includes("flut")) instrument = "Yan Flüt";
    return { kind: "tool", tool: "findAvailableTeachers", input: { instrument } };
  }

  const isScheduleQuery =
    /program|schedule|dersleri/i.test(t) ||
    (/ders/i.test(t) && /ne\s*zaman/i.test(t)) ||
    (/lesson/i.test(t) && /when/i.test(t));
  const studentId = t.match(/\b(s\d+|stu_[\w]+)\b/i)?.[1];
  const teacherIdForSchedule = t.match(/\bt\d+\b/i)?.[0];
  if (isScheduleQuery) {
    if (studentId && canUse("getStudentSchedule")) {
      return { kind: "tool", tool: "getStudentSchedule", input: { studentId } };
    }
    if (teacherIdForSchedule && canUse("getTeacherSchedule")) {
      return { kind: "tool", tool: "getTeacherSchedule", input: { teacherId: teacherIdForSchedule } };
    }
    // No id pattern — best-effort NAME extraction ("Can'ın dersi ne zaman",
    // "when is Can's lesson"). Real LLM providers extract the name via their
    // own NLU when calling this tool; this is only the keyless fallback.
    const nameCandidate = canUse("findPersonSchedule") ? extractNameCandidate(text) : undefined;
    if (nameCandidate) {
      return { kind: "tool", tool: "findPersonSchedule", input: { query: nameCandidate } };
    }
    return {
      kind: "needs_info",
      message:
        "Kimin programını görmek istediğinizi belirtmediniz. Öğrenci için \"s1 programı\", " +
        "öğretmen için \"t2 programı\" ya da doğrudan kişinin adını yazabilirsiniz " +
        "(örn. \"Can'ın dersi ne zaman\").",
    };
  }

  const isAttendanceSummaryQuery = /yoklama\s*(özeti|ozeti)|bugün\s*kim\s*(geldi|gelmedi)/i.test(t);
  if (isAttendanceSummaryQuery) {
    return {
      kind: "needs_info",
      message:
        "Sohbet üzerinden yalnızca belirli bir dersin yoklamasını sorgulayabilir/işaretleyebilirim " +
        "(örn. \"l8 geldi\"). Günün TÜM derslerinin özeti için Yoklama ekranındaki " +
        "\"AI ile özetle\" butonunu kullanın — orada gerçek günlük veri kullanılır.",
    };
  }

  if (/bakiye|ödeme|odeme|balance|payment|borç/i.test(t)) {
    if (/ödendi|odendi|mark.*paid|tahsil/i.test(t)) {
      const paymentId = t.match(/\b(p\d+)\b/i)?.[1];
      if (!paymentId) {
        return {
          kind: "needs_info",
          message: "Hangi ödemeyi tahsil edildi olarak işaretlemek istediğinizi belirtin, örn. \"p5 ödendi\".",
        };
      }
      if (!canUse("createPayment")) return { kind: "no_match" };
      return { kind: "tool", tool: "createPayment", input: { paymentId } };
    }
    if (!studentId) {
      return {
        kind: "needs_info",
        message: "Hangi öğrencinin bakiyesini görmek istediğinizi belirtin, örn. \"s1 bakiyesi\".",
      };
    }
    if (!canUse("getParentBalance")) return { kind: "no_match" };
    return { kind: "tool", tool: "getParentBalance", input: { studentId } };
  }

  if (/telafi.*slot|slot.*öner|slot.*oner|suggest.*makeup|telafi\s*öner/i.test(t)) {
    const requestId = t.match(/\b(m\d+|mk_[\w]+)\b/i)?.[1];
    if (!requestId) {
      return {
        kind: "needs_info",
        message:
          "Hangi telafi talebi için slot önerisi istediğinizi belirtin, örn. \"m1 için telafi slotu öner\". " +
          "Tüm açık taleplerin öncelik özeti için Telafi Merkezi ekranındaki \"AI ile öncelik özeti\" " +
          "butonunu kullanabilirsiniz.",
      };
    }
    if (!canUse("findAvailableSlots")) return { kind: "no_match" };
    return { kind: "tool", tool: "findAvailableSlots", input: { requestId } };
  }

  if (/gelmedi|geldi|attendance|absent|present/i.test(t)) {
    const lessonId = t.match(/\b(l\d+|l_[\w]+)\b/i)?.[1];
    if (!lessonId) {
      return {
        kind: "needs_info",
        message: "Hangi ders için yoklama işaretlemek istediğinizi belirtin, örn. \"l8 geldi\" veya \"l8 gelmedi\".",
      };
    }
    if (!canUse("markAttendance")) return { kind: "no_match" };
    let status: "present" | "absent" | "cancelled_by_school" = "present";
    if (/gelmedi|absent/i.test(t)) status = "absent";
    if (/okul iptal|cancelled_by_school/i.test(t)) status = "cancelled_by_school";
    return {
      kind: "tool",
      tool: "markAttendance",
      input: { lessonId, status, reason: status === "absent" ? "AI chat kaydı" : undefined },
    };
  }

  return { kind: "no_match" };
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Splits provider-bridge.ts's `"<description>\n\nBağlam: {json}"` convention. */
function parseCapabilityMessage(
  userMessage: string
): { capabilityId: AiCapabilityId; context: Record<string, unknown> } | null {
  const marker = "\n\nBağlam: ";
  const markerIndex = userMessage.indexOf(marker);
  const head = markerIndex === -1 ? userMessage : userMessage.slice(0, markerIndex);
  const contextRaw = markerIndex === -1 ? "" : userMessage.slice(markerIndex + marker.length);
  const headText = head.replace(/\s*\(ek bağlam verilmedi\)$/, "");

  let context: Record<string, unknown> = {};
  if (contextRaw) {
    try {
      const parsed = JSON.parse(contextRaw);
      if (parsed && typeof parsed === "object") context = parsed as Record<string, unknown>;
    } catch {
      return null; // malformed — never guess, let the caller fall back honestly
    }
  }

  for (const id of Object.keys(AI_CAPABILITIES) as AiCapabilityId[]) {
    if (AI_CAPABILITIES[id].description === headText) {
      return { capabilityId: id, context };
    }
  }
  return null;
}

function formatCapabilityNarration(capabilityId: AiCapabilityId, context: Record<string, unknown>): string {
  switch (capabilityId) {
    case "attendanceDailySummary": {
      const total = num(context.totalLessons);
      if (total === undefined) return "Bugün için ders verisi bulunamadı.";
      if (total === 0) return "Bugün için planlanmış ders yok.";
      const present = num(context.present) ?? 0;
      const late = num(context.late) ?? 0;
      const absent = num(context.absent) ?? 0;
      const cancelled = num(context.schoolCancelled) ?? 0;
      const notYet = num(context.notYetTaken) ?? 0;
      const parts = [`${total} ders`, `${present} geldi`];
      if (late) parts.push(`${late} geç kaldı`);
      if (absent) parts.push(`${absent} gelmedi`);
      if (cancelled) parts.push(`${cancelled} okul iptali`);
      if (notYet) parts.push(`${notYet} henüz alınmadı`);
      return `Bugünün yoklama özeti: ${parts.join(", ")}.`;
    }
    case "makeupSlotSuggestion": {
      const openCount = num(context.openCount);
      if (openCount === undefined) return "Telafi talebi verisi bulunamadı.";
      if (openCount === 0) return "Açık telafi talebi yok.";
      const expiringSoon = num(context.expiringSoon) ?? 0;
      const byInstrument = asRecord(context.byInstrument);
      const parts = [`${openCount} açık telafi talebi var`];
      if (expiringSoon > 0) parts.push(`${expiringSoon} tanesi 3 gün içinde süresi doluyor — öncelikli`);
      if (byInstrument && Object.keys(byInstrument).length > 0) {
        parts.push(`enstrüman dağılımı: ${Object.entries(byInstrument).map(([k, v]) => `${k} ${v}`).join(", ")}`);
      }
      return parts.join(". ") + ".";
    }
    case "collectionsIntake": {
      const untrackedCount = num(context.untrackedCount);
      if (untrackedCount === undefined) return "Takip edilmeyen kayıt verisi bulunamadı.";
      if (untrackedCount === 0) return "Takibi başlamamış kayıt yok — kuyruk temiz.";
      const totalAmount = num(context.totalUntrackedAmount);
      const top = asArray(context.topCases)
        .map((c) => asRecord(c))
        .filter((r): r is Record<string, unknown> => Boolean(r))
        .slice(0, 3)
        .map((r) => `${str(r.studentName) ?? "?"} (${num(r.daysOverdue) ?? "?"} gün, ${formatMoney(num(r.remaining) ?? 0)})`);
      const parts = [`${untrackedCount} kayıt henüz takibe alınmamış`];
      if (totalAmount !== undefined) parts.push(`toplam ${formatMoney(totalAmount)}`);
      if (top.length) parts.push(`öncelikli: ${top.join(", ")}`);
      return `${parts.join(", ")}. Gerçek takibi başlatmak için kuyruktan "Takip başlat"a tıklayın.`;
    }
    case "collectionsMessageDraft": {
      const studentName = str(context.studentName) ?? "öğrencimiz";
      const parentName = str(context.parentName) ?? "Değerli velimiz";
      const amount = num(context.amount);
      const amountLabel = amount !== undefined ? formatMoney(amount) : "bekleyen tutar";
      return (
        `Merhaba ${parentName}, ${studentName} için ${amountLabel} tutarındaki ödemenin takibi ` +
        `hakkında bilgi vermek isteriz. Uygun olduğunuzda tamamlarsanız seviniriz. Sorularınız için ` +
        `bize ulaşabilirsiniz, teşekkür ederiz.`
      );
    }
    case "collectionsROIReport": {
      const trackedOutstanding = num(context.trackedOutstanding);
      if (trackedOutstanding === undefined) return "ROI verisi bulunamadı.";
      const overdueCount = num(context.overdueCount) ?? 0;
      const attributedThisMonth = num(context.attributedThisMonth) ?? 0;
      const resolvedThisMonth = num(context.resolvedThisMonth) ?? 0;
      const lostThisMonth = num(context.lostThisMonth) ?? 0;
      const successRate = num(context.successRate);
      const successLabel = successRate === undefined ? "—" : `%${Math.round(successRate * 100)}`;
      return (
        `Takip edilen alacak ${formatMoney(trackedOutstanding)} (${overdueCount} gecikmiş kayıt). ` +
        `Bu ay ${formatMoney(attributedThisMonth)} tahsil edildi (${resolvedThisMonth} vaka ödendi, ` +
        `${lostThisMonth} sonuçsuz), başarı oranı ${successLabel}.`
      );
    }
    case "teacherPerformanceScore": {
      const teacherName = str(context.teacherName) ?? "Bu öğretmen";
      const score = num(context.score);
      if (score === undefined) return `${teacherName} için henüz yeterli yoklama geçmişi yok, güvenilir bir skor hesaplanamadı.`;
      const graded = num(context.gradedLessonCount) ?? 0;
      const cancelled = num(context.schoolCancelledCount) ?? 0;
      const tone =
        score >= 85 ? "güçlü bir katılım/devamlılık gösteriyor" : score >= 60 ? "orta seviyede, iyileştirmeye açık" : "düşük — yakından takip önerilir";
      const cancelNote = cancelled > 0 ? ` ${cancelled} okul kaynaklı iptal skoru düşürdü.` : "";
      return `${teacherName}: performans skoru ${score}/100 (${graded} işlenmiş ders). Bu, ${tone}.${cancelNote}`;
    }
    case "attendanceRiskAssessment": {
      const atRiskCount = num(context.atRiskCount);
      if (atRiskCount === undefined) return "Devamsızlık riski verisi bulunamadı.";
      if (atRiskCount === 0) return "Devamsızlık riski taşıyan öğrenci yok.";
      const highRiskCount = num(context.highRiskCount) ?? 0;
      const top = asArray(context.topCases)
        .map((c) => asRecord(c))
        .filter((r): r is Record<string, unknown> => Boolean(r))
        .slice(0, 3)
        .map((r) => `${str(r.studentName) ?? "?"} (${r.riskLevel === "high" ? "yüksek" : "orta"} risk, ${num(r.absentCount) ?? "?"} gelmedi)`);
      const parts = [`${atRiskCount} öğrenci risk taşıyor (${highRiskCount} yüksek risk)`];
      if (top.length) parts.push(`öncelikli: ${top.join(", ")}`);
      return parts.join(", ") + ".";
    }
    case "feedbackSummary": {
      const responseCount = num(context.responseCount) ?? 0;
      const averages = asRecord(context.criteriaAverages) ?? {};
      const labels = asRecord(context.criteriaLabels) ?? {};
      const themes = asArray(context.themes).map((t) => str(t)).filter((t): t is string => Boolean(t));
      const avgLine = Object.entries(averages)
        .map(([key, value]) => `${str(labels[key]) ?? key}: ${value}/5`)
        .join(", ");
      return [
        "Genel eğilim",
        `${responseCount} değerlendirme üzerinden kriter ortalamaları: ${avgLine || "veri yok"}.`,
        "",
        "Tekrarlayan temalar",
        themes.length > 0 ? themes.join(", ") : "belirgin bir tekrar eden tema yok",
      ].join("\n");
    }
  }
}

export const heuristicProvider: LlmProvider = {
  name: "heuristic",

  async plan({ messages, tools }) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = lastUser?.content || "";
    const allowed = new Set(tools.map((t) => t.name));
    const intent = detectIntent(text, allowed);

    if (intent.kind === "tool") return { toolCalls: [{ tool: intent.tool, input: intent.input }] };
    if (intent.kind === "needs_info") return { assistantText: intent.message };

    const catalog = tools.map((t) => `• ${t.name}: ${t.description}`).join("\n");
    return {
      assistantText:
        `Bunu bir göreve eşleştiremedim (heuristic mod — API anahtarı yapılandırılmamış).\n\n` +
        `Örnekler: "Gitar öğretmenlerini listele", "s1 bakiyesi", "m1 için telafi slotu öner".\n\n` +
        `Araçlar:\n${catalog}`,
    };
  },

  async narrate({ userMessage, toolResults }) {
    if (toolResults.length > 0) {
      return summarizeToolResults(toolResults);
    }
    const parsed = parseCapabilityMessage(userMessage);
    if (parsed) return formatCapabilityNarration(parsed.capabilityId, parsed.context);
    return `İsteğinizi aldım ancak (heuristic mod) somut bir sonuç üretecek eşleşen veri bulamadım: "${userMessage.slice(0, 200)}"`;
  },

  async streamNarrate(args, onToken) {
    const full = await this.narrate(args);
    for (let i = 0; i < full.length; i += 16) {
      onToken(full.slice(i, i + 16));
    }
    return full;
  },
};
