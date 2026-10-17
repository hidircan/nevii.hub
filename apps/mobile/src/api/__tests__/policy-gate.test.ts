import { describe, it, expect, vi, beforeEach } from "vitest";

const secureStore = vi.hoisted(() => ({ data: new Map<string, string>() }));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "1.2.0" } } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => secureStore.data.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void secureStore.data.set(k, v),
  deleteItemAsync: async (k: string) => void secureStore.data.delete(k),
}));

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../client", () => ({ apiGet: (...args: unknown[]) => api.get(...args) }));

const policy = await import("../policy");

function basePolicy(over: Partial<import("../policy").MobilePolicy> = {}): import("../policy").MobilePolicy {
  return {
    allowed: true,
    reasons: [],
    platform: "ios",
    maintenance: { active: false, message: "" },
    minVersion: { ios: "1.0.0", android: "1.0.0" },
    updateRequired: false,
    push: { policy: "disabled", providerConfigured: false, active: false, note: "" },
    contractVersion: 1,
    configVersion: 7,
    ...over,
  };
}

const brand = { name: "Akademi A", logoUrl: "", colorPrimary: "#111", colorAccent: "#222", loginMessage: "Hoş geldin" };

describe("policyGateFor — sunucu kararı kapı önceliği", () => {
  it("hepsi temizse ok", () => {
    expect(policy.policyGateFor(basePolicy())).toBe("ok");
  });
  it("allowed=false bakım/güncellemeden önce gelir (blocked)", () => {
    expect(
      policy.policyGateFor(basePolicy({ allowed: false, reasons: ["Mobil portal kapalı."], maintenance: { active: true, message: "Bakım" }, updateRequired: true }))
    ).toBe("blocked");
  });
  it("bakım güncelleme zorunluluğundan önce gelir", () => {
    expect(policy.policyGateFor(basePolicy({ maintenance: { active: true, message: "Bakım" }, updateRequired: true }))).toBe(
      "maintenance"
    );
  });
  it("güncelleme gerekli", () => {
    expect(policy.policyGateFor(basePolicy({ updateRequired: true }))).toBe("update");
  });
});

describe("refreshMobilePolicy — taze karar + tenant-anahtarlı önbellek", () => {
  beforeEach(() => {
    secureStore.data.clear();
    api.get.mockReset();
  });

  it("başarılı yanıtta canlı kararı döndürür ve tenant+user anahtarıyla saklar", async () => {
    api.get.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/v1/mobile/policy")) return { ok: true, data: basePolicy() };
      return { ok: true, data: { branding: { institution: brand }, configVersion: 7 } };
    });
    const res = await policy.refreshMobilePolicy("tenant_a", "user_1");
    expect(res?.fromCache).toBe(false);
    expect(res?.policy.allowed).toBe(true);
    expect(res?.brand?.name).toBe("Akademi A");
    expect([...secureStore.data.keys()]).toEqual(["notaplan_mobile_policy_tenant_a_user_1"]);
  });

  it("ağ hatasında AYNI tenant+user önbelleğine düşer (fromCache), başka kurumun verisini vermez", async () => {
    api.get.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/v1/mobile/policy")) return { ok: true, data: basePolicy({ allowed: false, reasons: ["Kapalı."] }) };
      return { ok: true, data: { branding: { institution: brand }, configVersion: 7 } };
    });
    await policy.refreshMobilePolicy("tenant_a", "user_1");
    api.get.mockImplementation(async () => ({ ok: false, error: { code: "NETWORK_ERROR", message: "yok" } }));
    const cached = await policy.refreshMobilePolicy("tenant_a", "user_1");
    expect(cached?.fromCache).toBe(true);
    expect(cached?.policy.allowed).toBe(false);
    // başka kurum / başka kullanıcı bu önbelleği göremez
    expect(await policy.readCachedPolicy("tenant_b", "user_1")).toBeNull();
    expect(await policy.readCachedPolicy("tenant_a", "user_2")).toBeNull();
  });

  it("önbellek yok + ağ yoksa null (fail-closed hata ekranı)", async () => {
    api.get.mockImplementation(async () => ({ ok: false, error: { code: "NETWORK_ERROR", message: "yok" } }));
    expect(await policy.refreshMobilePolicy("tenant_a", "user_1")).toBeNull();
  });

  it("policy 200 ama snapshot 404 ise marka null, karar yine canlı", async () => {
    api.get.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/v1/mobile/policy")) return { ok: true, data: basePolicy() };
      return { ok: false, error: { code: "NOT_FOUND", message: "yok" } };
    });
    const res = await policy.refreshMobilePolicy("tenant_a", "user_1");
    expect(res?.fromCache).toBe(false);
    expect(res?.brand).toBeNull();
  });
});

describe("blockedCopyFor — persona'ya göre kapanma metni", () => {
  it("başlık her persona/nedende genel 'Mobil erişim kapalı' — sunucu nedeniyle çelişmez", () => {
    const reason = "Kurum paketinde mobil uygulama hakkı yok.";
    for (const p of ["teacher", "admin", "student", "parent", null] as const) {
      expect(policy.blockedCopyFor(p, [reason]).title).toBe("Mobil erişim kapalı");
    }
    expect(policy.blockedCopyFor("teacher", [reason]).body).toContain(reason);
    expect(policy.blockedCopyFor("admin", ["Kapalı."]).body).toContain("web panelini");
  });
  it("nedenler korunur", () => {
    expect(policy.blockedCopyFor("student", ["Mobil portal kapalı."]).body).toContain("Mobil portal kapalı.");
  });
});
