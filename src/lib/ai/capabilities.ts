/**
 * AI capability registry — METADATA ONLY. No LLM or DB calls here.
 *
 * Single source of truth for "what AI-assisted operations exist, who may
 * invoke them, do they need human approval, which existing tool/function do
 * they delegate to, and which provider they prefer." `plan-invocation.ts`
 * reads this; nothing here reaches into the store or the agent executor.
 *
 * `linkedTools` intentionally references EXISTING symbols only (agent
 * `AgentToolName` registry entries, or exported functions from
 * `src/lib/tahsilat/cases.ts` / `src/lib/insights/*.ts`) — no new flow is
 * invented in this module.
 */
import type { AppRole } from "../auth/types";
import type { ProviderId } from "./provider-chain";

export type AiCapabilityId =
  | "attendanceDailySummary"
  | "makeupSlotSuggestion"
  | "collectionsIntake"
  | "collectionsMessageDraft"
  | "collectionsROIReport"
  | "teacherPerformanceScore"
  | "attendanceRiskAssessment"
  | "feedbackSummary";

export type AiCapabilityDefinition = {
  id: AiCapabilityId;
  description: string;
  allowedRoles: AppRole[];
  /** True for anything that can result in an outbound message to a parent/teacher. */
  requiresApproval: boolean;
  /** Existing agent tool names or exported function names — never invented. */
  linkedTools: readonly string[];
  preferredProvider: ProviderId;
};

const SCHOOL_STAFF: AppRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER"];
const ADMIN_AND_AGENT: AppRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "AI_AGENT"];
const BUSINESS_OWNER: AppRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN"];

export const AI_CAPABILITIES: Record<AiCapabilityId, AiCapabilityDefinition> = {
  attendanceDailySummary: {
    id: "attendanceDailySummary",
    description: "Bugünün yoklama/ders durumunun okunabilir özeti (salt okunur).",
    allowedRoles: SCHOOL_STAFF,
    requiresApproval: false,
    // src/lib/agent/registry.ts — mevcut agent tool'ları
    linkedTools: ["getTeacherSchedule", "getStudentSchedule"],
    preferredProvider: "groq",
  },
  makeupSlotSuggestion: {
    id: "makeupSlotSuggestion",
    description: "Telafi dersi için uygun slot önerisi (öğretmen/oda/şube uygunluğu).",
    allowedRoles: [...SCHOOL_STAFF, "AI_AGENT"],
    requiresApproval: false,
    // src/lib/agent/registry.ts — bugün src/lib/makeup-engine.ts'in deterministik
    // skorlamasını sarmalıyor; LLM'siz doğru çalıştığı için tercih edilen
    // provider bilerek "heuristic".
    linkedTools: ["findAvailableSlots", "findAvailableTeachers"],
    preferredProvider: "heuristic",
  },
  collectionsIntake: {
    id: "collectionsIntake",
    description:
      "Gecikmiş/kısmi ödemeler için otomatik taslak takip vakası açma (US-04, AC-07..10).",
    allowedRoles: ADMIN_AND_AGENT,
    // Taslak AÇMAK onay gerektirmez — onay zorunluluğu SEND adımındadır
    // (collectionsMessageDraft), bkz. US-05/AC-11/AC-12.
    requiresApproval: false,
    // src/lib/tahsilat/cases.ts — mevcut export'lar
    linkedTools: ["upsertFollowUpCase", "listFollowUpCases"],
    preferredProvider: "heuristic",
  },
  collectionsMessageDraft: {
    id: "collectionsMessageDraft",
    description:
      "Veliye gönderilecek tahsilat mesajı taslağını hazırlar; asla otomatik göndermez (US-05).",
    allowedRoles: ADMIN_AND_AGENT,
    requiresApproval: true,
    // src/lib/agent/registry.ts (sendParentMessage) + src/lib/tahsilat/cases.ts
    linkedTools: ["sendParentMessage", "upsertFollowUpCase"],
    preferredProvider: "gemini",
  },
  collectionsROIReport: {
    id: "collectionsROIReport",
    description: "Aylık tahsilat katkısı (ROI) özeti — işletme sahibi görünümü (US-06).",
    allowedRoles: BUSINESS_OWNER,
    requiresApproval: false,
    // src/lib/tahsilat/cases.ts — mevcut export
    linkedTools: ["getCollectionRoi"],
    preferredProvider: "groq",
  },
  teacherPerformanceScore: {
    id: "teacherPerformanceScore",
    description:
      "Öğretmenin yoklama geçmişine dayalı, deterministik olarak hesaplanmış performans skorunun " +
      "yönetici için okunabilir yorumu — skorun kendisi bu capability'den ÖNCE, LLM'siz hesaplanır.",
    // Karar-destek: performans skoru HR-hassas bir yönetim sinyali, öğretmenin
    // kendisine değil yalnız işletme sahibine/yöneticiye açık.
    allowedRoles: BUSINESS_OWNER,
    requiresApproval: false,
    // src/lib/insights/teacher-performance.ts — mevcut export
    linkedTools: ["computeTeacherPerformanceScore"],
    preferredProvider: "groq",
  },
  attendanceRiskAssessment: {
    id: "attendanceRiskAssessment",
    description:
      "Öğrencinin devamsızlık geçmişine dayalı, deterministik olarak hesaplanmış risk düzeyinin " +
      "okunabilir yorumu — risk seviyesi bu capability'den ÖNCE, LLM'siz hesaplanır.",
    allowedRoles: SCHOOL_STAFF,
    requiresApproval: false,
    // src/lib/insights/attendance-risk.ts — mevcut export
    linkedTools: ["computeStudentAttendanceRisk"],
    preferredProvider: "groq",
  },
  feedbackSummary: {
    id: "feedbackSummary",
    description:
      "Karşılıklı Değerlendirmeler sprinti — bir öğretmen hakkındaki öğrenci/veli değerlendirmelerinin veya " +
      "bir öğrenci hakkındaki öğretmen değerlendirmelerinin yönetici için okunabilir özeti. Yalnızca yönetici " +
      "isteğiyle çalışır (otomatik tetiklenmez); kriter ortalamaları ve temalar bu capability'den ÖNCE, " +
      "LLM'siz hesaplanır — LLM yalnızca zaten anonimleştirilmiş/toplulaştırılmış veriyi yorumlar, ham yorum " +
      "veya kimlik asla prompt'a girmez.",
    allowedRoles: BUSINESS_OWNER,
    requiresApproval: false,
    // src/lib/feedback-summary.ts — mevcut export
    linkedTools: ["computeFeedbackSummaryStats"],
    preferredProvider: "groq",
  },
};

export function getCapability(id: AiCapabilityId): AiCapabilityDefinition | undefined {
  return AI_CAPABILITIES[id];
}

export function isKnownCapability(id: string): id is AiCapabilityId {
  return Object.prototype.hasOwnProperty.call(AI_CAPABILITIES, id);
}
