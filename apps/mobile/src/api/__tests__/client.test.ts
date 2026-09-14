import { describe, it, expect, vi, beforeEach } from "vitest";
import { sessionStatusFor } from "../../auth/session-status";

const store = vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  return { access: null as string | null, refresh: null as string | null, setCalls: 0 };
});

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../../auth/token-storage", () => ({
  getAccessToken: async () => store.access,
  getRefreshToken: async () => store.refresh,
  setTokens: async (a: string, r: string) => {
    store.setCalls += 1;
    store.access = a;
    store.refresh = r;
  },
  clearTokens: async () => {
    store.access = null;
    store.refresh = null;
  },
}));

const client = await import("../client");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const unauthorized = () => json(401, { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid" } });

describe("mobil API istemcisi — oturum ve refresh", () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    store.access = "access-1";
    store.refresh = "refresh-1";
    store.setCalls = 0;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("login 401 → refresh denenmez (döngü yok), Türkçe 401 mesajı", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized());
    const res = await client.apiPost("/api/v1/auth/login", { email: "a@b.c", password: "x" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("UNAUTHORIZED");
  });

  it("logout/refresh uçlarında da 401 refresh tetiklemez", async () => {
    fetchMock.mockResolvedValue(unauthorized());
    await client.apiPost("/api/v1/auth/logout");
    await client.apiPost("/api/v1/auth/refresh", { refreshToken: "x" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refresh başarısız → token'lar silinir, oturum-bitti handler'ı bir kez çağrılır, tekrar istek yok", async () => {
    const expired = vi.fn();
    const off = client.setSessionExpiredHandler(expired);
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(json(401, { ok: false }));
    const res = await client.apiGet("/api/v1/makeup");
    off();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/api/v1/auth/refresh");
    expect(store.access).toBeNull();
    expect(store.refresh).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(false);
  });

  it("refresh başarılı → istek bir kez tekrarlanır", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(json(200, { ok: true, data: { accessToken: "access-2", refreshToken: "refresh-2" } }))
      .mockResolvedValueOnce(json(200, { ok: true, data: { makeupRequests: [] } }));
    const res = await client.apiGet<{ makeupRequests: unknown[] }>("/api/v1/makeup");
    expect(res).toEqual({ ok: true, data: { makeupRequests: [] } });
    expect(store.access).toBe("access-2");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("çıkıştan sonra geç dönen refresh token'ları geri YAZMAZ", async () => {
    let releaseRefresh!: (r: Response) => void;
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockImplementationOnce(() => new Promise<Response>((r) => (releaseRefresh = r)));
    const pending = client.apiGet("/api/v1/makeup");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await client.endLocalSession();
    releaseRefresh(json(200, { ok: true, data: { accessToken: "late-access", refreshToken: "late-refresh" } }));
    const res = await pending;

    expect(res.ok).toBe(false);
    expect(store.setCalls).toBe(0);
    expect(store.access).toBeNull();
    expect(store.refresh).toBeNull();
  });

  it("ağ hatası → NETWORK_ERROR (sahte başarı yok)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    const res = await client.apiGet("/api/v1/makeup");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NETWORK_ERROR");
  });

  it("logout sunucu oturumunu gövdedeki refresh token ile kapatır; ağ yoksa hata fırlatmaz", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: { loggedOut: true } }));
    await client.revokeServerSession("refresh-1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/v1/auth/logout");
    expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: "refresh-1" });

    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(client.revokeServerSession("refresh-1")).resolves.toBeUndefined();
  });
});

describe("sessionStatusFor — soğuk açılış kararı", () => {
  it("ağ hatası sessiz çıkış yaptırmaz → error (Tekrar dene)", () => {
    expect(sessionStatusFor({ ok: false, error: { code: "NETWORK_ERROR", message: "x" } })).toBe("error");
    expect(sessionStatusFor({ ok: false, error: { code: "INTERNAL_ERROR", message: "x", status: 500 } })).toBe("error");
  });
  it("401 → güvenli çıkış", () => {
    expect(sessionStatusFor({ ok: false, error: { code: "UNAUTHORIZED", message: "x", status: 401 } })).toBe("signedOut");
  });
  it("başarı → signedIn", () => {
    expect(sessionStatusFor({ ok: true, data: {} })).toBe("signedIn");
  });
});
