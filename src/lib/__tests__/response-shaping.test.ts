import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { summarizeToolResults, isIdentityQuestion, describeIdentity } from "../ai/response-shaping";

const ENV_KEYS = [
  "AI_PROVIDER",
  "ANTHROPIC_API_KEY",
  "CLAUDE_MODEL",
  "OPENAI_API_KEY",
  "XAI_API_KEY",
  "GROK_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "LOCAL_LLM_URL",
  "GROQ_API_KEY",
  "CEREBRAS_API_KEY",
  "NVIDIA_NIM_API_KEY",
] as const;
const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    original[key] = process.env[key];
    delete process.env[key];
  }
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe("isIdentityQuestion", () => {
  it("Türkçe 'hangi modelsin' varyasyonlarını yakalar", () => {
    expect(isIdentityQuestion("merhaba sen hangi modelsin")).toBe(true);
    expect(isIdentityQuestion("ne modelsiniz")).toBe(true);
    expect(isIdentityQuestion("sen kimsin")).toBe(true);
  });

  it("İngilizce kimlik sorularını yakalar", () => {
    expect(isIdentityQuestion("which model are you")).toBe(true);
    expect(isIdentityQuestion("who are you")).toBe(true);
  });

  it("alakasız bir soruyu kimlik sorusu sanmaz", () => {
    expect(isIdentityQuestion("hangi öğretmen müsait")).toBe(false);
    expect(isIdentityQuestion("s1 bakiyesi")).toBe(false);
  });
});

describe("describeIdentity", () => {
  it("hiçbir API anahtarı yokken heuristic olduğunu VE nedenini açıklar", () => {
    const text = describeIdentity();
    expect(text).toMatch(/heuristic/i);
    expect(text).toMatch(/API anahtarı/i);
  });

  it("ANTHROPIC_API_KEY varsa Anthropic Claude olduğunu ve modeli söyler", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "test-key";
    const text = describeIdentity();
    expect(text).toMatch(/Anthropic Claude/);
    expect(text).toMatch(/claude-opus-5-5/);
  });

  it("GEMINI_API_KEY varsa gerçek provider adını ve modeli döner", () => {
    process.env.GEMINI_API_KEY = "test-key";
    const text = describeIdentity();
    expect(text).toMatch(/Gemini/i);
    expect(text).toMatch(/gemini-2\.5-flash/);
  });

  it("yalnızca GROQ_API_KEY varsa (Gemini yok) auto mode Groq'a düşer ve bunu doğru raporlar", () => {
    process.env.GROQ_API_KEY = "groq-test-key";
    const text = describeIdentity();
    expect(text).toMatch(/Groq/i);
    expect(text).toMatch(/llama-4-scout-17b/);
  });

  it("boşluktan ibaret bir GEMINI_API_KEY eksik anahtar sayılır, bir sonraki configured provider'a geçilir", () => {
    process.env.GEMINI_API_KEY = "   ";
    process.env.GROQ_API_KEY = "groq-test-key";
    const text = describeIdentity();
    expect(text).toMatch(/Groq/i);
  });
});

describe("summarizeToolResults", () => {
  it("boş sonuç listesi için boş string döner (çağıran kendi fallback'ini seçer)", () => {
    expect(summarizeToolResults([])).toBe("");
  });

  it("schedule sonucunu ders sayısıyla özetler", () => {
    const text = summarizeToolResults([
      { tool: "getStudentSchedule", ok: true, data: { studentId: "s1", lessons: [{}, {}, {}] } },
    ]);
    expect(text).toMatch(/3 ders/);
  });

  it("attendance (markAttendance) sonucunu durumla özetler", () => {
    const text = summarizeToolResults([
      { tool: "markAttendance", ok: true, data: { lessonId: "l8", status: "absent" } },
    ]);
    expect(text).toMatch(/gelmedi/);
  });

  it("balance sonucunu net borçla özetler", () => {
    const text = summarizeToolResults([
      {
        tool: "getParentBalance",
        ok: true,
        data: { studentId: "s1", payments: [{}, {}], outstanding: 4500 },
      },
    ]);
    expect(text).toMatch(/4\.500/);
    expect(text).toMatch(/2 ödeme kaydı/);
  });

  it("makeup slot önerisini bulunan slot sayısıyla özetler", () => {
    const text = summarizeToolResults([
      { tool: "findAvailableSlots", ok: true, data: { requestId: "m1", slots: [{}, {}] } },
    ]);
    expect(text).toMatch(/2 uygun telafi slotu/);
  });

  it("slot bulunamazsa bunu açıkça söyler", () => {
    const text = summarizeToolResults([
      { tool: "findAvailableSlots", ok: true, data: { requestId: "m1", slots: [] } },
    ]);
    expect(text).toMatch(/bulunamadı/);
  });

  it("mesaj taslağı sonucunu 'gönderilmedi' vurgusuyla özetler", () => {
    const text = summarizeToolResults([
      { tool: "sendParentMessage", ok: true, data: { message: {} } },
    ]);
    expect(text).toMatch(/taslağı hazırlandı/);
    expect(text).toMatch(/gönderilmedi/);
  });

  it("araç hatasında anlamlı, nedenini içeren bir mesaj üretir", () => {
    const text = summarizeToolResults([
      { tool: "getParentBalance", ok: false, error: "Student not found" },
    ]);
    expect(text).toMatch(/çalıştırılamadı/);
    expect(text).toMatch(/Student not found/);
  });

  it("birden fazla sonucu ayrı satırlarda birleştirir", () => {
    const text = summarizeToolResults([
      { tool: "getStudentSchedule", ok: true, data: { lessons: [{}] } },
      { tool: "getParentBalance", ok: false, error: "boom" },
    ]);
    expect(text.split("\n")).toHaveLength(2);
  });
});
