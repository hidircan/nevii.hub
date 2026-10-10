import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * providers/claude.ts — SDK ağ çağrısı yapmadan, istek gövdesini ve yanıt
 * ayrıştırmasını doğrular. `@anthropic-ai/sdk` modülü sahtelenir; APIError
 * sınıfı gerçek SDK'dan alınır ki `instanceof` dalı test edilsin.
 */

const createMock = vi.fn();
const streamMock = vi.fn();
const ctorMock = vi.fn();

vi.mock("@anthropic-ai/sdk", async () => {
  const actual = await vi.importActual<typeof import("@anthropic-ai/sdk")>("@anthropic-ai/sdk");
  class FakeAnthropic {
    static APIError = actual.default.APIError;
    beta = { messages: { create: createMock, stream: streamMock } };
    constructor(opts: unknown) {
      ctorMock(opts);
    }
  }
  return { default: FakeAnthropic };
});

function message(content: unknown[], stop_reason = "end_turn") {
  return { content, stop_reason };
}

beforeEach(() => {
  createMock.mockReset();
  streamMock.mockReset();
  ctorMock.mockReset();
});

describe("createClaudeProvider — plan()", () => {
  it("kayıtlı araçları input_schema ile gönderir, tool_use bloklarını LlmPlan'a çevirir, kayıtsız araçları atar", async () => {
    createMock.mockResolvedValue(
      message([
        { type: "text", text: "Bakıyorum." },
        { type: "tool_use", id: "t1", name: "getStudentSchedule", input: { studentId: "s1" } },
        { type: "tool_use", id: "t2", name: "dropDatabase", input: {} },
      ])
    );
    const { createClaudeProvider } = await import("../ai/providers/claude");
    const provider = createClaudeProvider({ apiKey: "k", model: "claude-opus-5-5", timeoutMs: 5000 });

    const plan = await provider.plan({
      messages: [
        { role: "assistant", content: "önceki selam" },
        { role: "system", content: "Kurum: Nilüfer" },
        { role: "user", content: "s1'in programı?" },
      ],
      tools: [
        {
          name: "getStudentSchedule",
          description: "Öğrenci programı",
          requiredRoles: [],
          inputSchema: {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            properties: { studentId: { type: "string" } },
          },
        },
      ],
    });

    expect(plan.toolCalls).toEqual([{ tool: "getStudentSchedule", input: { studentId: "s1" } }]);
    expect(plan.assistantText).toBe("Bakıyorum.");

    expect(ctorMock).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "k", timeout: 5000 }));
    const body = createMock.mock.calls[0][0];
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.tools[0]).toEqual({
      name: "getStudentSchedule",
      description: "Öğrenci programı",
      input_schema: { type: "object", properties: { studentId: { type: "string" } } },
    });
    // İlk mesaj user olmalı; system mesajı sistem metnine taşınır.
    expect(body.messages).toEqual([{ role: "user", content: "s1'in programı?" }]);
    expect(body.system).toContain("Kurum: Nilüfer");
    expect(body.output_config).toEqual({ effort: "medium" });
    expect(body.fallbacks).toBe("default");
    expect(body.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(body.tool_choice).toBeUndefined();
  });

  it("effort/fallbacks desteklemeyen bir model seçilirse bu alanları göndermez", async () => {
    createMock.mockResolvedValue(message([{ type: "text", text: "Merhaba" }]));
    const { createClaudeProvider } = await import("../ai/providers/claude");
    const provider = createClaudeProvider({ apiKey: "k", model: "claude-haiku-4-5" });
    await provider.plan({ messages: [], tools: [] });

    const body = createMock.mock.calls[0][0];
    expect(body.output_config).toBeUndefined();
    expect(body.fallbacks).toBeUndefined();
    expect(body.betas).toBeUndefined();
    expect(body.tools).toBeUndefined();
    expect(body.messages).toEqual([{ role: "user", content: "Merhaba" }]);
  });

  it("refusal stop_reason'ı hata olarak fırlatır (içerik okunmaz)", async () => {
    createMock.mockResolvedValue(message([{ type: "text", text: "" }], "refusal"));
    const { createClaudeProvider } = await import("../ai/providers/claude");
    const provider = createClaudeProvider({ apiKey: "k", model: "claude-opus-5-5" });
    await expect(provider.plan({ messages: [{ role: "user", content: "x" }], tools: [] })).rejects.toThrow(
      /reddetti/
    );
  });

  it("401 APIError, isAuthConfigError'ın tanıdığı LlmProviderError'a çevrilir (zincir bu provider'ı tekrar denemez)", async () => {
    const Anthropic = (await vi.importActual<typeof import("@anthropic-ai/sdk")>("@anthropic-ai/sdk")).default;
    createMock.mockRejectedValue(
      Anthropic.APIError.generate(401, { error: { message: "invalid x-api-key" } }, "invalid x-api-key", new Headers())
    );
    const { createClaudeProvider } = await import("../ai/providers/claude");
    const { LlmProviderError, isAuthConfigError } = await import("../ai/config");
    const provider = createClaudeProvider({ apiKey: "bad", model: "claude-opus-5-5" });

    const err = await provider.plan({ messages: [{ role: "user", content: "x" }], tools: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmProviderError);
    expect(err.provider).toBe("claude");
    expect(err.status).toBe(401);
    expect(isAuthConfigError(err)).toBe(true);
  });
});

describe("createClaudeProvider — narrate() / streamNarrate()", () => {
  it("narrate araç sonuçlarını özetletir ve metni döner", async () => {
    createMock.mockResolvedValue(message([{ type: "text", text: "S1'in 2 dersi var." }]));
    const { createClaudeProvider } = await import("../ai/providers/claude");
    const provider = createClaudeProvider({ apiKey: "k", model: "claude-opus-5-5" });
    const text = await provider.narrate({
      userMessage: "s1 programı",
      toolResults: [{ tool: "getStudentSchedule", ok: true, data: { lessons: 2 } }],
    });
    expect(text).toBe("S1'in 2 dersi var.");
    const body = createMock.mock.calls[0][0];
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.messages[0].content).toContain('"lessons":2');
  });

  it("streamNarrate metin parçalarını onToken'a iletir ve son mesajın metnini döner", async () => {
    streamMock.mockImplementation(() => {
      const handlers: Record<string, (t: string) => void> = {};
      return {
        on(event: string, cb: (t: string) => void) {
          handlers[event] = cb;
          return this;
        },
        async finalMessage() {
          handlers.text?.("Merhaba ");
          handlers.text?.("dünya");
          return message([{ type: "text", text: "Merhaba dünya" }]);
        },
      };
    });
    const { createClaudeProvider } = await import("../ai/providers/claude");
    const provider = createClaudeProvider({ apiKey: "k", model: "claude-opus-5-5" });
    const tokens: string[] = [];
    const full = await provider.streamNarrate!({ userMessage: "x", toolResults: [] }, (t) => tokens.push(t));
    expect(tokens).toEqual(["Merhaba ", "dünya"]);
    expect(full).toBe("Merhaba dünya");
  });
});
