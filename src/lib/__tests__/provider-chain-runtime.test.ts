import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "CLAUDE_MODEL",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_MODEL",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "GROQ_BASE_URL",
  "CEREBRAS_API_KEY",
  "CEREBRAS_MODEL",
  "CEREBRAS_BASE_URL",
  "NVIDIA_NIM_API_KEY",
  "NVIDIA_NIM_MODEL",
  "NVIDIA_NIM_BASE_URL",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_AI_MODEL",
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

describe("resolveChainProviderConfig — her provider için env-tabanlı, hiç fırlatmaz", () => {
  it("heuristic her zaman configured döner (env gerekmez)", async () => {
    const { resolveChainProviderConfig } = await import("../ai/config");
    expect(resolveChainProviderConfig("heuristic")).toEqual({ id: "heuristic", configured: true });
  });

  it("claude: ANTHROPIC_API_KEY yoksa configured:false, varsa varsayılan model claude-opus-5-5 döner", async () => {
    const { resolveChainProviderConfig } = await import("../ai/config");
    expect(resolveChainProviderConfig("claude")).toEqual({ id: "claude", configured: false });
    process.env.ANTHROPIC_API_KEY = "a-key";
    expect(resolveChainProviderConfig("claude")).toMatchObject({
      id: "claude",
      configured: true,
      apiKey: "a-key",
      model: "claude-opus-5-5",
    });
    process.env.ANTHROPIC_API_KEY = "  ";
    expect(resolveChainProviderConfig("claude").configured).toBe(false);
  });

  it("gemini: API anahtarı yoksa configured:false döner", async () => {
    const { resolveChainProviderConfig } = await import("../ai/config");
    expect(resolveChainProviderConfig("gemini")).toEqual({ id: "gemini", configured: false });
  });

  it("gemini: GEMINI_API_KEY varsa configured:true + varsayılan model döner", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const { resolveChainProviderConfig } = await import("../ai/config");
    const cfg = resolveChainProviderConfig("gemini");
    expect(cfg).toMatchObject({ id: "gemini", configured: true, apiKey: "test-key", model: "gemini-2.5-flash" });
  });

  it("gemini: boşluktan ibaret bir GEMINI_API_KEY eksik anahtar sayılır", async () => {
    process.env.GEMINI_API_KEY = "   ";
    const { resolveChainProviderConfig } = await import("../ai/config");
    expect(resolveChainProviderConfig("gemini").configured).toBe(false);
  });

  it("groq: GROQ_API_KEY yoksa unconfigured; varsa kendi base URL/model varsayılanlarıyla döner", async () => {
    const { resolveChainProviderConfig } = await import("../ai/config");
    expect(resolveChainProviderConfig("groq").configured).toBe(false);

    process.env.GROQ_API_KEY = "groq-key";
    const cfg = resolveChainProviderConfig("groq");
    expect(cfg).toMatchObject({
      id: "groq",
      configured: true,
      apiKey: "groq-key",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "llama-4-scout-17b",
    });
  });

  it("groq: GROQ_BASE_URL / GROQ_MODEL env'i override eder", async () => {
    process.env.GROQ_API_KEY = "groq-key";
    process.env.GROQ_BASE_URL = "https://custom.groq.example/v1";
    process.env.GROQ_MODEL = "custom-model";
    const { resolveChainProviderConfig } = await import("../ai/config");
    const cfg = resolveChainProviderConfig("groq");
    expect(cfg).toMatchObject({ baseUrl: "https://custom.groq.example/v1", model: "custom-model" });
  });

  it("cerebras: CEREBRAS_API_KEY yoksa unconfigured; varsa varsayılan model gpt-oss-120b", async () => {
    const { resolveChainProviderConfig } = await import("../ai/config");
    expect(resolveChainProviderConfig("cerebras").configured).toBe(false);

    process.env.CEREBRAS_API_KEY = "cerebras-key";
    expect(resolveChainProviderConfig("cerebras")).toMatchObject({
      configured: true,
      model: "gpt-oss-120b",
    });
  });

  it("nvidiaNim: NVIDIA_NIM_API_KEY yoksa unconfigured; varsa varsayılan model nemotron-3-ultra-550b-a55b", async () => {
    const { resolveChainProviderConfig } = await import("../ai/config");
    expect(resolveChainProviderConfig("nvidiaNim").configured).toBe(false);

    process.env.NVIDIA_NIM_API_KEY = "nim-key";
    expect(resolveChainProviderConfig("nvidiaNim")).toMatchObject({
      configured: true,
      model: "nemotron-3-ultra-550b-a55b",
    });
  });

  it("cloudflareAi: yalnızca accountId VEYA yalnızca apiToken varsa hâlâ unconfigured (ikisi de gerekli)", async () => {
    const { resolveChainProviderConfig } = await import("../ai/config");
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc_1";
    expect(resolveChainProviderConfig("cloudflareAi").configured).toBe(false);
  });

  it("cloudflareAi: hem accountId hem apiToken varsa configured:true döner", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc_1";
    process.env.CLOUDFLARE_API_TOKEN = "token_1";
    const { resolveChainProviderConfig } = await import("../ai/config");
    const cfg = resolveChainProviderConfig("cloudflareAi");
    expect(cfg).toMatchObject({ configured: true, accountId: "acc_1", apiToken: "token_1" });
  });
});

describe("resolveLiveProvider — chain provider'ları gerçek LlmProvider'a çözer", () => {
  it("unconfigured bir provider için null döner (silent fake support yok)", async () => {
    const { resolveLiveProvider } = await import("../ai/provider-factory");
    expect(resolveLiveProvider("gemini")).toBeNull();
    expect(resolveLiveProvider("groq")).toBeNull();
    expect(resolveLiveProvider("cerebras")).toBeNull();
    expect(resolveLiveProvider("nvidiaNim")).toBeNull();
    expect(resolveLiveProvider("cloudflareAi")).toBeNull();
  });

  it("heuristic her zaman resolve olur", async () => {
    const { resolveLiveProvider } = await import("../ai/provider-factory");
    const provider = resolveLiveProvider("heuristic");
    expect(provider?.name).toBe("heuristic");
  });

  it("gemini configured olduğunda kendi native adapter'ına çözülür", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const { resolveLiveProvider } = await import("../ai/provider-factory");
    const provider = resolveLiveProvider("gemini");
    expect(provider?.name).toBe("gemini");
  });

  it("groq/cerebras/nvidiaNim configured olduğunda openai-compatible adapter'a doğru isimle çözülür", async () => {
    process.env.GROQ_API_KEY = "k";
    process.env.CEREBRAS_API_KEY = "k";
    process.env.NVIDIA_NIM_API_KEY = "k";
    const { resolveLiveProvider } = await import("../ai/provider-factory");
    expect(resolveLiveProvider("groq")?.name).toBe("groq");
    expect(resolveLiveProvider("cerebras")?.name).toBe("cerebras");
    expect(resolveLiveProvider("nvidiaNim")?.name).toBe("nvidiaNim");
  });

  it("claude configured olduğunda kendi adapter'ına çözülür, değilse null döner", async () => {
    const { resolveLiveProvider } = await import("../ai/provider-factory");
    expect(resolveLiveProvider("claude")).toBeNull();
    process.env.ANTHROPIC_API_KEY = "a-key";
    expect(resolveLiveProvider("claude")?.name).toBe("claude");
  });

  it("cloudflareAi configured olduğunda kendi adapter'ına çözülür", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc_1";
    process.env.CLOUDFLARE_API_TOKEN = "token_1";
    const { resolveLiveProvider } = await import("../ai/provider-factory");
    expect(resolveLiveProvider("cloudflareAi")?.name).toBe("cloudflareAi");
  });
});

describe("checkAllProviderHealth — hassas değer sızdırmadan tüm zinciri raporlar", () => {
  it("PROVIDER_CHAIN'deki 6 provider için de bir kayıt döner (cloudflareAi auto zincirinde değil); unconfigured olanlar 'unconfigured', heuristic her zaman 'healthy'", async () => {
    const { checkAllProviderHealth } = await import("../ai/metrics");
    const rows = await checkAllProviderHealth();
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.id)).toEqual(["claude", "gemini", "groq", "nvidiaNim", "cerebras", "heuristic"]);
    const heuristic = rows.find((r) => r.id === "heuristic");
    expect(heuristic).toMatchObject({ configured: true, status: "healthy" });
    const gemini = rows.find((r) => r.id === "gemini");
    expect(gemini).toMatchObject({ configured: false, status: "unconfigured" });
  });

  it("configured bir provider için apiKey/token değerleri çıktıya asla sızmaz", async () => {
    process.env.GEMINI_API_KEY = "super-secret-key";
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc_1";
    process.env.CLOUDFLARE_API_TOKEN = "super-secret-token";
    const { checkAllProviderHealth } = await import("../ai/metrics");
    const rows = await checkAllProviderHealth();
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain("super-secret-key");
    expect(serialized).not.toContain("super-secret-token");
    const gemini = rows.find((r) => r.id === "gemini");
    expect(gemini).toMatchObject({ configured: true, status: "healthy", model: "gemini-2.5-flash" });
  });
});

describe("PROVIDER_CHAIN sıralaması — auto mode order (Claude → Gemini → Groq → NVIDIA NIM → Cerebras → Heuristic)", () => {
  it("PROVIDER_CHAIN tam olarak bu 6 adımı, bu sırayla içerir", async () => {
    const { PROVIDER_CHAIN } = await import("../ai/provider-chain");
    expect(PROVIDER_CHAIN.map((p) => p.id)).toEqual([
      "claude",
      "gemini",
      "groq",
      "nvidiaNim",
      "cerebras",
      "heuristic",
    ]);
  });

  it("nextProviderInChain zinciri baştan sona doğru sırayla ilerletir ve heuristic'te durur", async () => {
    const { nextProviderInChain } = await import("../ai/provider-chain");
    expect(nextProviderInChain("claude")).toBe("gemini");
    expect(nextProviderInChain("gemini")).toBe("groq");
    expect(nextProviderInChain("groq")).toBe("nvidiaNim");
    expect(nextProviderInChain("nvidiaNim")).toBe("cerebras");
    expect(nextProviderInChain("cerebras")).toBe("heuristic");
    expect(nextProviderInChain("heuristic")).toBe("heuristic");
  });

  it("cloudflareAi PROVIDER_CHAIN'in bir üyesi değildir (auto sıralamasının dışında), ama isKnownProvider dışında hâlâ doğrudan resolve edilebilir", async () => {
    const { isKnownProvider } = await import("../ai/provider-chain");
    const { resolveLiveProvider } = await import("../ai/provider-factory");
    expect(isKnownProvider("cloudflareAi")).toBe(false);
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc_1";
    process.env.CLOUDFLARE_API_TOKEN = "token_1";
    expect(resolveLiveProvider("cloudflareAi")?.name).toBe("cloudflareAi");
  });
});
