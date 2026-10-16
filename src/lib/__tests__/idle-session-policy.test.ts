/**
 * 2026-10-16 — web hareketsizlik politikası SUNUCUDA: JWT `act` (son gerçek etkileşim). Çerezli (tarayıcı) yenileme
 * ve API isteği süre aşılınca reddedilir; mobil (gövdeden refresh / Bearer) muaf; yenileme `act`'i ilerletmez, yalnız
 * açık etkinlik isteği ilerletir.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { IDLE_LOGOUT_MS, isIdleExpired, nowSec } from "../session-policy";

const { resetPlatformStoreForTests } = await import("../platform/store");
const { invalidateSessionValidity } = await import("../auth/session-validity");
const { __resetRateLimitForTests } = await import("../rate-limit");
const { issueTokenPair, verifyRefreshToken } = await import("../auth/jwt");
const { authenticateRequest } = await import("../auth/authenticate");

beforeEach(async () => {
  await fs.rm(path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json"), { force: true });
  await resetPlatformStoreForTests();
  invalidateSessionValidity();
  __resetRateLimitForTests();
});

const UA = { "user-agent": "Mozilla/5.0 (Macintosh) Chrome/120.0", origin: "http://localhost" };

async function loginClaims() {
  const { POST } = await import("../../app/api/v1/auth/login/route");
  const res = await POST(
    new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: { ...UA, "content-type": "application/json" },
      body: JSON.stringify({ email: "ezgi.guclu@niluferacar.com.tr", password: "demo-manager-ezgi" }),
    })
  );
  const json = await res.json();
  if (!json.ok) throw new Error(JSON.stringify(json));
  return verifyRefreshToken(json.data.refreshToken as string);
}

async function pairWithAct(act: number) {
  const c = await loginClaims();
  expect(typeof c.act).toBe("number");
  return issueTokenPair({ userId: c.sub, role: c.role, tenantId: c.tenantId, sid: c.sid, act });
}

async function refresh(init: { cookie?: string; body?: unknown }) {
  const { POST } = await import("../../app/api/v1/auth/refresh/route");
  return POST(
    new Request("http://localhost/api/v1/auth/refresh", {
      method: "POST",
      headers: { ...UA, "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) },
      body: JSON.stringify(init.body ?? {}),
    })
  );
}

describe("hareketsiz oturum — sunucu kapısı", () => {
  const stale = () => nowSec() - Math.ceil(IDLE_LOGOUT_MS / 1000) - 60;

  it("saf kural: act yoksa (eski token) süre işlemez; aşıldıysa true", () => {
    expect(isIdleExpired(undefined)).toBe(false);
    expect(isIdleExpired(nowSec())).toBe(false);
    expect(isIdleExpired(stale())).toBe(true);
  });

  it("süre aşılınca yenileme reddedilir — çerezden de gövdeden de (taşıma yolu kontrolü atlatmaz)", async () => {
    const t = await pairWithAct(stale());
    const web = await refresh({ cookie: `np_refresh=${t.refreshToken}` });
    expect(web.status).toBe(401);
    expect((await web.json()).error.message).toContain("oturumunuz kapatıldı");
    expect((await refresh({ body: { refreshToken: t.refreshToken } })).status).toBe(401);
  });

  it("mobil giriş (Origin yok) token'ında act yok: hareketsizlik uygulanmaz, yenileme act eklemez", async () => {
    const { POST } = await import("../../app/api/v1/auth/login/route");
    const res = await POST(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "okhttp/4.9" },
        body: JSON.stringify({ email: "ezgi.guclu@niluferacar.com.tr", password: "demo-manager-ezgi" }),
      })
    );
    const json = await res.json();
    expect((await verifyRefreshToken(json.data.refreshToken)).act).toBeUndefined();
    const again = await (await refresh({ body: { refreshToken: json.data.refreshToken } })).json();
    expect((await verifyRefreshToken(again.data.refreshToken)).act).toBeUndefined();
  });

  it("yenileme etkinlik sayılmaz (act korunur); açık etkinlik isteği act'i şimdiye çeker", async () => {
    const old = nowSec() - 600;
    const t = await pairWithAct(old);
    const plain = await (await refresh({ cookie: `np_refresh=${t.refreshToken}` })).json();
    expect((await verifyRefreshToken(plain.data.refreshToken)).act).toBe(old);
    const active = await (await refresh({ cookie: `np_refresh=${t.refreshToken}`, body: { activity: true } })).json();
    expect((await verifyRefreshToken(active.data.refreshToken)).act).toBeGreaterThan(old + 500);
  });

  it("API: süre aşılmış tarayıcı token'ı çerezle de Bearer ile de reddedilir; taze token geçer", async () => {
    const t = await pairWithAct(stale());
    expect((await authenticateRequest(new Request("http://localhost/api/v1/x", { headers: { cookie: `np_access=${t.accessToken}` } }), "r")).ok).toBe(false);
    expect((await authenticateRequest(new Request("http://localhost/api/v1/x", { headers: { authorization: `Bearer ${t.accessToken}` } }), "r")).ok).toBe(false);
    const fresh = await pairWithAct(nowSec());
    expect((await authenticateRequest(new Request("http://localhost/api/v1/x", { headers: { authorization: `Bearer ${fresh.accessToken}` } }), "r")).ok).toBe(true);
  });
});
