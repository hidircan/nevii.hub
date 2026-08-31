import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { computeMetaSignature, verifyMetaSignature } from "../whatsapp/meta-signature";
import { __resetRateLimitForTests } from "../rate-limit";
import { POST as webhookPost, GET as webhookGet } from "../../app/api/v1/whatsapp/webhook/route";

const INBOUND_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "sms-inbound-events.json");

const ORIGINAL_ENV = { ...process.env };

beforeEach(async () => {
  await fs.rm(INBOUND_FILE, { force: true });
  __resetRateLimitForTests("whatsapp-webhook");
  process.env = { ...ORIGINAL_ENV };
  process.env.WHATSAPP_PROVIDER = "meta";
  process.env.WHATSAPP_META_APP_SECRET = "test-app-secret";
  process.env.WHATSAPP_VERIFY_TOKEN = "test-verify-token";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function metaBody(messageId: string, from = "905551112233", text = "merhaba") {
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { id: messageId, from, timestamp: `${Math.floor(Date.now() / 1000)}`, type: "text", text: { body: text } },
              ],
            },
          },
        ],
      },
    ],
  });
}

describe("Meta imzası", () => {
  it("geçerli imzayı kabul, bozuk imzayı reddeder", () => {
    const body = metaBody("wamid.1");
    const sig = computeMetaSignature("test-app-secret", body);
    expect(verifyMetaSignature({ appSecret: "test-app-secret", rawBody: body, signatureHeader: sig })).toBe(true);
    expect(verifyMetaSignature({ appSecret: "test-app-secret", rawBody: body, signatureHeader: "sha256=deadbeef" })).toBe(false);
  });
});

describe("public whatsapp webhook", () => {
  it("imzasız isteği 401 ile reddeder ve mesajı işlemez", async () => {
    const req = new Request("https://example.test/api/v1/whatsapp/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: metaBody("wamid.unsigned"),
    });
    const res = await webhookPost(req);
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(JSON.stringify(json)).not.toMatch(/test-app-secret/);
  });

  it("secret hiç ayarlanmamışsa (503) state değiştirmeden fail-closed döner", async () => {
    delete process.env.WHATSAPP_META_APP_SECRET;
    const body = metaBody("wamid.nosecret");
    const req = new Request("https://example.test/api/v1/whatsapp/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const res = await webhookPost(req);
    expect(res.status).toBe(503);
  });

  it("geçerli imzalı isteği kabul eder; aynı mesaj id'si replay'de tekrar işlenmez", async () => {
    const body = metaBody("wamid.dup1");
    const sig = computeMetaSignature("test-app-secret", body);
    const makeReq = () =>
      new Request("https://example.test/api/v1/whatsapp/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": sig },
        body,
      });
    const first = await webhookPost(makeReq());
    const second = await webhookPost(makeReq());
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const d1 = (await first.json()) as { data: { processed: number } };
    const d2 = (await second.json()) as { data: { processed: number } };
    expect(d1.data.processed).toBe(1);
    expect(d2.data.processed).toBe(0); // duplicate provider message id — skipped
  });

  it("rate limit aşımında 429 döner", async () => {
    const body = metaBody("wamid.rl");
    const sig = computeMetaSignature("test-app-secret", body);
    const req = () =>
      new Request("https://example.test/api/v1/whatsapp/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": sig,
          "x-forwarded-for": "203.0.113.9",
        },
        body,
      });
    let last: Response | undefined;
    for (let i = 0; i < 61; i++) {
      last = await webhookPost(req());
    }
    expect(last?.status).toBe(429);
  });

  it("GET doğrulama: hardcoded/predictable token kabul edilmez, sadece configured token geçer", async () => {
    const badUrl = new URL("https://example.test/api/v1/whatsapp/webhook");
    badUrl.searchParams.set("hub.mode", "subscribe");
    badUrl.searchParams.set("hub.verify_token", "nevii-hub-wa-verify"); // old hardcoded default
    badUrl.searchParams.set("hub.challenge", "chal123");
    const badRes = await webhookGet(new Request(badUrl));
    expect(badRes.status).toBe(403);

    const goodUrl = new URL("https://example.test/api/v1/whatsapp/webhook");
    goodUrl.searchParams.set("hub.mode", "subscribe");
    goodUrl.searchParams.set("hub.verify_token", "test-verify-token");
    goodUrl.searchParams.set("hub.challenge", "chal123");
    const goodRes = await webhookGet(new Request(goodUrl));
    expect(goodRes.status).toBe(200);
    expect(await goodRes.text()).toBe("chal123");
  });

  it("verify token ayarlanmamışsa GET her zaman 403 döner (fail-closed)", async () => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    vi.stubEnv("NODE_ENV", "production");
    const url = new URL("https://example.test/api/v1/whatsapp/webhook");
    url.searchParams.set("hub.mode", "subscribe");
    url.searchParams.set("hub.verify_token", "");
    url.searchParams.set("hub.challenge", "chal123");
    const res = await webhookGet(new Request(url));
    expect(res.status).toBe(403);
    vi.unstubAllEnvs();
  });
});
