import { describe, it, expect, vi, beforeEach } from "vitest";

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
const okPayload = { ok: true, data: { hello: "world" } };

describe("mobil API istemcisi — maliyet hardening", () => {
  const fetchMock = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>();

  beforeEach(async () => {
    store.access = "access-1";
    store.refresh = "refresh-1";
    store.setCalls = 0;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    await client.endLocalSession();
    store.access = "access-1";
    store.refresh = "refresh-1";
  });

  it("eşzamanlı aynı-path GET'ler tek ağ isteğini paylaşır", async () => {
    fetchMock.mockResolvedValueOnce(json(200, okPayload));
    const [a, b, c] = await Promise.all([
      client.apiGet("/api/v1/notifications"),
      client.apiGet("/api/v1/notifications"),
      client.apiGet("/api/v1/notifications"),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.ok && b.ok && c.ok).toBe(true);
  });

  it("farklı path'ler paylaşılmaz", async () => {
    fetchMock.mockResolvedValue(json(200, okPayload));
    await Promise.all([client.apiGet("/api/v1/a"), client.apiGet("/api/v1/b")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tamamlanan istek haritada kalmaz (sonraki çağrı yeniden ağa çıkar)", async () => {
    fetchMock.mockResolvedValue(json(200, okPayload));
    await client.apiGet("/api/v1/notifications");
    await client.apiGet("/api/v1/notifications");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("oturum sonu in-flight haritayı temizler (kullanıcılar arası sızıntı yok)", async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { release = resolve; }));
    const pending = client.apiGet("/api/v1/notifications");
    await client.endLocalSession();
    release(json(200, okPayload));
    await pending;
    fetchMock.mockResolvedValueOnce(json(200, okPayload));
    await client.apiGet("/api/v1/notifications");
    // İkinci çağrı eski paylaşılan yanıtı ALMAZ — yeniden ağa çıkar.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("5xx'te GET sınırlı retry yapar ve toparlanır", async () => {
    fetchMock
      .mockResolvedValueOnce(json(500, { ok: false, error: { code: "INTERNAL_ERROR", message: "x" } }))
      .mockResolvedValueOnce(json(200, okPayload));
    const res = await client.apiGet("/api/v1/notifications");
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("4xx'te GET retry YAPMAZ (403 tek istek)", async () => {
    fetchMock.mockResolvedValue(json(403, { ok: false, error: { code: "FORBIDDEN", message: "x" } }));
    const res = await client.apiGet("/api/v1/students/abc");
    expect(res.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("mutation'lar otomatik retry ALMAZ (5xx'te bile tek deneme)", async () => {
    fetchMock.mockResolvedValue(json(500, { ok: false, error: { code: "INTERNAL_ERROR", message: "x" } }));
    await client.apiPost("/api/v1/attendance", { a: 1 });
    await client.apiPatch("/api/v1/x", { a: 1 });
    await client.apiDelete("/api/v1/x");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("çağrı sinyaliyle iptal edilen arama retry yapmaz ve ağ isteğini düşürür", async () => {
    const ctrl = new AbortController();
    fetchMock.mockImplementationOnce(async (_url, init) => {
      ctrl.abort();
      init?.signal?.throwIfAborted();
      return json(200, okPayload);
    });
    const res = await client.apiGet("/api/v1/students?q=ab&limit=50", { signal: ctrl.signal });
    expect(res.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sinyalli istekler dedupe'a katılmaz (her biri özel istektir)", async () => {
    fetchMock.mockResolvedValue(json(200, okPayload));
    const c1 = new AbortController();
    const c2 = new AbortController();
    await Promise.all([
      client.apiGet("/api/v1/students?q=ab&limit=50", { signal: c1.signal }),
      client.apiGet("/api/v1/students?q=ab&limit=50", { signal: c2.signal }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
