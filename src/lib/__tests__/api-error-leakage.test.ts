import { describe, it, expect, vi } from "vitest";
import { withApiHandler } from "../api/handler";

describe("API hata mesajı sızıntısı (K4)", () => {
  it("beklenmeyen Error mesajı response'a değil, sadece log'a yazılır", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const secretDetail = "ECONNREFUSED mysql://user:supersecretpw@internal-db:3306/notaplan";
    const handler = withApiHandler(
      async () => {
        throw new Error(secretDetail);
      },
      { public: true }
    );

    const res = await handler(new Request("https://example.test/api/v1/whatever", { method: "GET" }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("supersecretpw");
    expect(text).not.toContain("ECONNREFUSED");
    const json = JSON.parse(text) as { error?: { code?: string; message?: string } };
    expect(json.error?.code).toBe("INTERNAL_ERROR");
    expect(json.error?.message).not.toMatch(/supersecretpw|ECONNREFUSED/);

    // The detail must still land server-side (logged), not silently dropped.
    const loggedSomewhere = errorSpy.mock.calls.some((call) =>
      call.some((arg) => String(arg).includes(secretDetail) || (arg as Error)?.message === secretDetail)
    );
    expect(loggedSomewhere).toBe(true);
    errorSpy.mockRestore();
  });

  it("non-Error throw (string/object) da response'a sızmaz", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withApiHandler(
      async () => {
        throw { internalPath: "/var/secret/config.json", stack: "leak-me" };
      },
      { public: true }
    );
    const res = await handler(new Request("https://example.test/api/v1/whatever", { method: "GET" }));
    const text = await res.text();
    expect(text).not.toContain("leak-me");
    expect(text).not.toContain("/var/secret");
    errorSpy.mockRestore();
  });

  it("bilinen VALIDATION/UNAUTHORIZED gibi hatalar doğru status ile geçmeye devam eder", async () => {
    const { fail } = await import("../services/result");
    const handler = withApiHandler(
      async () => fail("VALIDATION_ERROR", "Geçersiz alan: email"),
      { public: true }
    );
    const res = await handler(new Request("https://example.test/api/v1/whatever", { method: "GET" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message).toBe("Geçersiz alan: email");
  });
});
