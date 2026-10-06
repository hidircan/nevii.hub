/**
 * Turns raw tool-call results into short, task-specific human text —
 * replacing generic "İşlem tamamlandı." acknowledgments. Pure formatting:
 * no DB/LLM/network calls, no side effects. Shared by `orchestrator.ts`
 * (fallback when a real provider's `narrate()` fails/returns empty) and
 * `providers/heuristic.ts` (its primary narration path).
 */
import { formatMoney } from "../utils";
import { getProviderConfig } from "./config";

export type ToolResultLike = { tool: string; ok: boolean; data?: unknown; error?: string };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function summarizeOne(result: ToolResultLike): string {
  if (!result.ok) {
    return `❌ ${result.tool} çalıştırılamadı: ${result.error || "bilinmeyen hata"}.`;
  }
  const data = asRecord(result.data);

  switch (result.tool) {
    case "getStudentSchedule": {
      const lessons = asArray(data?.lessons);
      return lessons.length === 0
        ? "Öğrenci programı: kayıtlı ders bulunamadı."
        : `Öğrenci programı: ${lessons.length} ders bulundu.`;
    }
    case "getTeacherSchedule": {
      const lessons = asArray(data?.lessons);
      return lessons.length === 0
        ? "Öğretmen programı: kayıtlı ders bulunamadı."
        : `Öğretmen programı: ${lessons.length} ders bulundu.`;
    }
    case "markAttendance": {
      const status = typeof data?.status === "string" ? data.status : undefined;
      const statusLabel =
        status === "present"
          ? "geldi"
          : status === "absent"
            ? "gelmedi (telafi hakkı oluşabilir)"
            : status === "late"
              ? "geç kaldı"
              : status === "cancelled_by_school"
                ? "okul iptali (telafi hakkı oluşabilir)"
                : status || "işlendi";
      return `Yoklama kaydedildi: ${statusLabel}.`;
    }
    case "getParentBalance": {
      const outstanding = typeof data?.outstanding === "number" ? data.outstanding : undefined;
      const payments = asArray(data?.payments);
      if (outstanding === undefined) return "Bakiye bilgisi alındı.";
      return outstanding > 0
        ? `Bakiye: ${payments.length} ödeme kaydı, kalan borç ${formatMoney(outstanding)}.`
        : `Bakiye: ${payments.length} ödeme kaydı, bekleyen borç yok.`;
    }
    case "findAvailableSlots": {
      const slots = asArray(data?.slots);
      return slots.length > 0
        ? `${slots.length} uygun telafi slotu bulundu — en yüksek puanlı seçenek en üstte listelenir.`
        : "Uygun telafi saati bulunamadı — öğretmen/oda müsaitliği veya çakışma olabilir.";
    }
    case "findPersonSchedule": {
      const matchType = typeof data?.matchType === "string" ? data.matchType : undefined;
      if (matchType === "none") {
        return `"${str(data?.query) ?? ""}" adında kayıtlı bir öğrenci/öğretmen bulunamadı.`;
      }
      if (matchType === "ambiguous") {
        const names = asArray(data?.candidates)
          .map((c) => asRecord(c))
          .filter((r): r is Record<string, unknown> => Boolean(r))
          .map((c) => `${str(c.name) ?? "?"} (${c.kind === "teacher" ? "öğretmen" : "öğrenci"})`)
          .join(", ");
        return `Birden fazla eşleşme bulundu: ${names}. Hangisini kastettiğinizi belirtin.`;
      }
      if (matchType === "student" || matchType === "teacher") {
        const name = str(data?.name) ?? "Kişi";
        const lessons = asArray(data?.upcomingLessons)
          .map((l) => asRecord(l))
          .filter((r): r is Record<string, unknown> => Boolean(r));
        if (lessons.length === 0) return `${name} için planlanmış yaklaşan ders bulunamadı.`;
        const startAt = str(lessons[0].startAt);
        const when = startAt
          ? new Date(startAt).toLocaleString("tr-TR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "?";
        const more = lessons.length > 1 ? ` (+${lessons.length - 1} ders daha)` : "";
        return `${name}'in bir sonraki dersi: ${when}${more}.`;
      }
      return "Kişi bilgisi işlendi.";
    }
    case "findAvailableTeachers": {
      const teachers = asArray(data?.teachers);
      return teachers.length > 0
        ? `${teachers.length} uygun öğretmen bulundu.`
        : "Bu kritere uyan uygun öğretmen bulunamadı.";
    }
    case "sendParentMessage":
    case "sendTeacherMessage":
      return "Mesaj taslağı hazırlandı — henüz gönderilmedi, gönderim ayrı bir onay adımı gerektirir.";
    case "createPayment": {
      const status = typeof data?.status === "string" ? data.status : "güncellendi";
      return `Ödeme durumu güncellendi: ${status}.`;
    }
    case "confirmMakeupLesson":
      return data?.lessonId ? "Telafi dersi onaylandı ve programa eklendi." : "Telafi onaylandı.";
    case "cancelMakeupLesson":
      return "Telafi talebi iptal edildi.";
    case "createMakeupLesson":
      return "Telafi hakkı oluşturuldu.";
    case "createStudent":
      return "Yeni öğrenci kaydedildi.";
    case "createTeacher":
      return "Yeni öğretmen kaydedildi.";
    case "resetDemo":
      return "Demo verisi sıfırlandı.";
    default:
      return `${result.tool} tamamlandı.`;
  }
}

/** Empty string when there is nothing to summarize (caller decides the no-tool fallback). */
export function summarizeToolResults(toolResults: ToolResultLike[]): string {
  if (toolResults.length === 0) return "";
  return toolResults.map(summarizeOne).join("\n");
}

// Trailing "model"/"yapay zeka" is NOT word-bounded on purpose — Turkish
// attaches suffixes directly ("hangi modelsin", "ne modelsiniz"), so a
// trailing `\b` would fail to match mid-word.
const IDENTITY_PATTERN =
  /\b(hangi|ne)\s+(model|yapay\s*zeka|ai)|\b(sen\s+)?(kimsin|nesin)\b|\bwhich\s+model\b|\bwhat\s+model\b|\bwho\s+are\s+you\b/i;

export function isIdentityQuestion(text: string): boolean {
  return IDENTITY_PATTERN.test(text);
}

/**
 * Deterministic "hangi modelsin" answer — built from `getProviderConfig()`,
 * never from the LLM itself (so it's accurate regardless of which provider
 * happens to be active, and honest when none is configured).
 */
export function describeIdentity(): string {
  const cfg = getProviderConfig();
  if (cfg.name === "heuristic") {
    return (
      "Şu anda heuristic (kural tabanlı, LLM'siz) modda çalışıyorum. " +
      "Hiçbir sağlayıcı için API anahtarı yapılandırılmamış (ANTHROPIC_API_KEY / GEMINI_API_KEY / " +
      "GROQ_API_KEY / NVIDIA_NIM_API_KEY / CEREBRAS_API_KEY), bu yüzden gerçek bir " +
      "dil modeli yerine anahtar kelimelere dayalı, deterministik bir asistanım."
    );
  }
  const providerLabel: Record<string, string> = {
    claude: "Anthropic Claude",
    gemini: "Google Gemini",
    groq: "Groq Cloud",
    nvidiaNim: "NVIDIA NIM",
    cerebras: "Cerebras",
    openai: "OpenAI",
    grok: "xAI Grok",
    local: "yerel (self-hosted) bir model",
  };
  return `Şu anda ${providerLabel[cfg.name] ?? cfg.name} kullanıyorum — model: ${cfg.model}.`;
}
