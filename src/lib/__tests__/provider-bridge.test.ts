import { describe, it, expect, vi, beforeEach } from "vitest";

const TENANT = "tenant_nilufer_acar";

describe("executeWithProvider — fail closed (planAiInvocation reddi)", () => {
  it("izin verilmeyen bir çağrı fırlatır (executeWithProvider provider'a hiç ulaşmaz)", async () => {
    const { executeWithProvider } = await import("../ai/provider-bridge");
    await expect(
      executeWithProvider(
        "collectionsROIReport",
        { prompt: "test" },
        { callerRole: "STUDENT", tenantId: TENANT, operation: "payments" }
      )
    ).rejects.toThrow();
  });

  it("eksik tenant'ta reddeder", async () => {
    const { executeWithProvider } = await import("../ai/provider-bridge");
    await expect(
      executeWithProvider(
        "collectionsROIReport",
        { prompt: "test" },
        { callerRole: "SCHOOL_ADMIN", tenantId: "", operation: "payments" }
      )
    ).rejects.toThrow(/kurum/i);
  });
});

describe("executeWithProvider — heuristic tercih edilen capability'ler", () => {
  it("makeupSlotSuggestion (preferredProvider: heuristic) deterministik olarak heuristic ile çalışır", async () => {
    const { executeWithProvider } = await import("../ai/provider-bridge");
    const res = await executeWithProvider(
      "makeupSlotSuggestion",
      { prompt: "m1 için telafi slotu öner" },
      { callerRole: "TEACHER", tenantId: TENANT, operation: "telafi" }
    );
    expect(res.provider).toBe("heuristic");
    expect(res.usedFallback).toBe(false);
    expect(res.triedProviders).toEqual(["heuristic"]);
    expect(typeof res.result.text).toBe("string");
    expect(res.result.text.length).toBeGreaterThan(0);
  });
});

describe("executeWithProvider — zincir boyunca sıradaki configured provider'a geçer", () => {
  const upsertMock = vi.fn().mockResolvedValue({});

  beforeEach(() => {
    vi.resetModules();
    upsertMock.mockClear();
    vi.doMock("../db", () => ({
      prisma: { aiAuditLog: { upsert: upsertMock, updateMany: vi.fn() } },
    }));
  });

  it("claude unconfigured, gemini hata verirse groq/nvidiaNim/cerebras (test ortamında unconfigured) atlanır, heuristic'e ulaşılır — triedProviders TÜM zinciri yansıtır (Claude → Gemini → Groq → NVIDIA NIM → Cerebras → Heuristic sırası)", async () => {
    vi.doMock("../ai/provider-factory", async () => {
      const actual =
        await vi.importActual<typeof import("../ai/provider-factory")>("../ai/provider-factory");
      return {
        ...actual,
        resolveLiveProvider: (id: string) => {
          if (id === "gemini") {
            return {
              name: "gemini",
              plan: vi.fn(),
              narrate: vi.fn().mockRejectedValue(new Error("gemini down")),
            };
          }
          return actual.resolveLiveProvider(id as Parameters<typeof actual.resolveLiveProvider>[0]);
        },
      };
    });

    const { executeWithProvider } = await import("../ai/provider-bridge");
    const res = await executeWithProvider(
      "collectionsMessageDraft",
      { prompt: "Veliye gecikmiş ödeme hatırlatması yaz" },
      { callerRole: "SCHOOL_ADMIN", tenantId: TENANT, operation: "payments" }
    );

    expect(res.provider).toBe("heuristic");
    expect(res.usedFallback).toBe(true);
    expect(res.triedProviders).toEqual(["claude", "gemini", "groq", "nvidiaNim", "cerebras", "heuristic"]);
    expect(typeof res.result.text).toBe("string");
  });

  it("gemini geçersiz anahtar (401/auth) hatası verirse bir daha DENENMEZ — zincirde sadece bir kez görünür, sıradaki provider'a geçilir", async () => {
    const { LlmProviderError } = await import("../ai/config");
    const geminiNarrate = vi.fn().mockRejectedValue(new LlmProviderError("API key not valid", "gemini", 400));
    vi.doMock("../ai/provider-factory", async () => {
      const actual =
        await vi.importActual<typeof import("../ai/provider-factory")>("../ai/provider-factory");
      return {
        ...actual,
        resolveLiveProvider: (id: string) => {
          if (id === "gemini") return { name: "gemini", plan: vi.fn(), narrate: geminiNarrate };
          return actual.resolveLiveProvider(id as Parameters<typeof actual.resolveLiveProvider>[0]);
        },
      };
    });

    const { executeWithProvider } = await import("../ai/provider-bridge");
    const res = await executeWithProvider(
      "collectionsMessageDraft",
      { prompt: "test" },
      { callerRole: "SCHOOL_ADMIN", tenantId: TENANT, operation: "payments" }
    );

    expect(res.provider).toBe("heuristic");
    // gemini yalnızca BİR kez triedProviders'ta görünür — auth hatası sonrası
    // zincirin ilerideki bir noktasında tekrar denenmez.
    expect(res.triedProviders.filter((p) => p === "gemini")).toHaveLength(1);
    expect(geminiNarrate).toHaveBeenCalledTimes(1);
  });

  it("hem gemini hem zincirin sonundaki heuristic başarısız olursa fırlatır (audit yine de fire-and-forget yazılır, testi bloklamaz)", async () => {
    vi.doMock("../ai/provider-factory", async () => {
      const actual =
        await vi.importActual<typeof import("../ai/provider-factory")>("../ai/provider-factory");
      return {
        ...actual,
        resolveLiveProvider: (id: string) => {
          if (id === "gemini") {
            return { name: "gemini", plan: vi.fn(), narrate: vi.fn().mockRejectedValue(new Error("gemini down")) };
          }
          if (id === "heuristic") {
            return {
              name: "heuristic",
              plan: vi.fn(),
              narrate: vi.fn().mockRejectedValue(new Error("heuristic also down")),
            };
          }
          return actual.resolveLiveProvider(id as Parameters<typeof actual.resolveLiveProvider>[0]);
        },
      };
    });

    const { executeWithProvider } = await import("../ai/provider-bridge");
    await expect(
      executeWithProvider(
        "collectionsMessageDraft",
        { prompt: "test" },
        { callerRole: "SCHOOL_ADMIN", tenantId: TENANT, operation: "payments" }
      )
    ).rejects.toThrow(/heuristic also down/);
  });

  it("bir provider unconfigured (null) döndüğünde de zincirde sıradakine geçer, hata fırlatmaz", async () => {
    vi.doMock("../ai/provider-factory", async () => {
      const actual =
        await vi.importActual<typeof import("../ai/provider-factory")>("../ai/provider-factory");
      return {
        ...actual,
        resolveLiveProvider: (id: string) => {
          if (id === "gemini") return null; // unconfigured
          return actual.resolveLiveProvider(id as Parameters<typeof actual.resolveLiveProvider>[0]);
        },
      };
    });

    const { executeWithProvider } = await import("../ai/provider-bridge");
    const res = await executeWithProvider(
      "collectionsMessageDraft",
      { prompt: "test" },
      { callerRole: "SCHOOL_ADMIN", tenantId: TENANT, operation: "payments" }
    );
    expect(res.provider).toBe("heuristic");
    expect(res.triedProviders.slice(0, 2)).toEqual(["claude", "gemini"]);
  });
});

describe("executeWithProvider — audit invocationId geçişi", () => {
  it("context.invocationId verilirse audit yazımı aynı id ile yapılır (upsert where.id eşleşir)", async () => {
    // Önceki describe bloğunun doMock'ları dosya boyunca kalıcıdır —
    // burada gerçek heuristic/provider-factory davranışına dönmek için
    // açıkça unmock ediyoruz.
    vi.doUnmock("../ai/provider-factory");
    vi.doUnmock("../ai/providers/heuristic");
    const upsertMock = vi.fn().mockResolvedValue({});
    vi.resetModules();
    vi.doMock("../db", () => ({
      prisma: { aiAuditLog: { upsert: upsertMock, updateMany: vi.fn() } },
    }));

    const { executeWithProvider } = await import("../ai/provider-bridge");
    await executeWithProvider(
      "makeupSlotSuggestion",
      { prompt: "test" },
      { callerRole: "TEACHER", tenantId: TENANT, operation: "telafi", invocationId: "fixed-inv-1" }
    );

    // Fire-and-forget — mikro görev kuyruğunun boşalmasını bekle.
    await new Promise((r) => setTimeout(r, 0));
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "fixed-inv-1" } })
    );
  });
});
