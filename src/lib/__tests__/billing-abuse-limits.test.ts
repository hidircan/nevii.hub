/**
 * §12 negatif testleri: sürdürme ucu tekdüze yanıt + hız sınırı; yetkili
 * ödeme uçlarında kullanıcı-bazlı limit kayıtları.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { POST as resumePost } from "@/app/api/v1/billing/orders/resume/route";

const ROOT = process.cwd();
const req = (body: unknown, ip: string) =>
  new Request("http://localhost/api/v1/billing/orders/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("sürdürme ucu (§12)", () => {
  it("bilinmeyen e-posta da 200 + aynı mesaj (numaralandırma yok)", async () => {
    const res = await resumePost(req({ email: "kimse@ornek.test" }, "10.9.0.1"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { message: string } };
    expect(json.ok).toBe(true);
    expect(json.data.message).toMatch(/gönderildi/);
  });

  it("6. hızlı istek 429 (IP kovası saatte 5)", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await resumePost(req({ email: `hizli${i}@ornek.test` }, "10.9.0.2"));
      expect(r.status).toBe(200);
    }
    const limited = await resumePost(req({ email: "hizli5@ornek.test" }, "10.9.0.2"));
    expect(limited.status).toBe(429);
  });

  it("bozuk JSON 400", async () => {
    const res = await resumePost(req("{bozuk", "10.9.0.3"));
    expect(res.status).toBe(400);
  });
});

describe("yetkili ödeme uçlarında limit kaydı (§12)", () => {
  const cases: [string, string][] = [
    ["src/app/api/v1/billing/checkout/route.ts", "billing-checkout-user"],
    ["src/app/api/v1/billing/card/route.ts", "billing-card-user"],
    ["src/app/api/v1/billing/subscription/cancel/route.ts", "billing-cancel-user"],
    ["src/app/api/v1/billing/subscription/reactivate/route.ts", "billing-reactivate-user"],
    ["src/app/api/v1/billing/orders/pay/route.ts", "pending-order-pay"],
    ["src/app/api/v1/billing/orders/setup-link/route.ts", "order-setup-link"],
  ];
  for (const [file, bucket] of cases) {
    it(`${file} → ${bucket}`, () => {
      const src = readFileSync(path.join(ROOT, file), "utf8");
      expect(src).toContain(`consumeRateLimit("${bucket}"`);
    });
  }
});
