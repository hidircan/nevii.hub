import { describe, it, expect, afterEach, vi } from "vitest";
import { POST as forgotPassword } from "../../app/api/v1/auth/forgot-password/route";
import { setEmailTransportForTests } from "../email";
import type { EmailSendInput } from "../email/types";


/**
 * Şifre sıfırlama TESLİM arıza modları (2026-09-28, info@neviihub.com
 * olayı): hesap yoksa e-posta DENENMEZ bile (sessizlik = deneme yok,
 * deneme-başarısızlık değil); sağlayıcı yapılandırılmamışsa yanıt yine
 * nötrdür ve route 500'e düşmez. Gerçek gönderim YOK (mock transport).
 */

function req(email: string): Request {
  return new Request("http://localhost/api/v1/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

const sentTo: string[] = [];

afterEach(() => {
  setEmailTransportForTests(null);
  sentTo.length = 0;
  vi.unstubAllEnvs();
});

describe("forgot-password teslim arıza modları", () => {
  it("bilinmeyen hesap → nötr 200 VE e-posta denemesi yok", async () => {
    setEmailTransportForTests({
      name: "mock",
      send: async (input: EmailSendInput) => {
        sentTo.push(input.to);
        return { delivered: true, messageId: "m1" };
      },
    });
    const res = await forgotPassword(req("hic-var-olmamis-hesap-9@example.test"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.message).toContain("kayıtlı bir hesap varsa");
    expect(sentTo).toEqual([]);
  });

  it("var hesap + BLOKE sağlayıcı → nötr 200, 500 yok, deneme kaydı var", async () => {
    setEmailTransportForTests({
      name: "mock-blocked",
      send: async (input: EmailSendInput) => {
        sentTo.push(input.to);
        return { delivered: false, blocked: true, reason: "EMAIL_PROVIDER_NOT_CONFIGURED" };
      },
    });
    const res = await forgotPassword(req("ada.yilmaz.demo@email.com"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.message).toContain("kayıtlı bir hesap varsa");
    expect(sentTo).toEqual(["ada.yilmaz.demo@email.com"]);
  });

  it("AI_AGENT servis hesabı → nötr 200 VE sıfırlama e-postası denenmez (girişi kapalı hesap)", async () => {
    setEmailTransportForTests({
      name: "mock",
      send: async (input: EmailSendInput) => {
        sentTo.push(input.to);
        return { delivered: true, messageId: "m2" };
      },
    });
    const res = await forgotPassword(req("agent@notaplan.app"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.message).toContain("kayıtlı bir hesap varsa");
    expect(sentTo).toEqual([]);
  });

  it("rate limit aşımında bile nötr 200 (limit sızdırılmaz)", async () => {
    const email = "rate-notr-test-28@example.test";
    for (let i = 0; i < 7; i++) {
      const res = await forgotPassword(req(email));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.message).toContain("kayıtlı bir hesap varsa");
    }
  });
});
