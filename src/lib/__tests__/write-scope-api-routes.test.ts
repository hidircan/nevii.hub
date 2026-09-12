import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID, PLATFORM_TENANT_ID } from "../auth/config";
import type { AuthUser } from "../auth/types";

/**
 * Tahsilat ekranı /api/v1/tahsilat/cases ve /api/v1/payments/:id/pay REST
 * uçlarını doğrudan çağırır (server action değil) — bu yüzden write-scope
 * koruması actions.ts'in withAuthContext'inden AYRI olarak bu route
 * dosyalarına da eklendi (bkz. route.ts'lerdeki resolveWriteScope
 * çağrıları). Bu testler o korumayı gerçek withApiHandler zinciri üzerinden
 * doğrular; yalnızca JWT doğrulamasını (authenticateRequest) ve kurum
 * cookie'sini sahteler.
 */
const mockUser: { value: AuthUser } = {
  value: { userId: "u1", role: "SCHOOL_ADMIN", tenantId: DEFAULT_TENANT_ID },
};
const mockCookieValue: { value: string | undefined } = { value: undefined };
const mockTenants: { list: { tenantId: string; name: string }[] } = { list: [] };

vi.mock("@/lib/auth/authenticate", () => ({
  authenticateRequest: async () => ({ ok: true, user: mockUser.value }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "notaplan_kurum" && mockCookieValue.value !== undefined
        ? { value: mockCookieValue.value }
        : undefined,
    set: () => {},
  }),
}));

vi.mock("@/lib/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../store")>();
  return {
    ...actual,
    listTenants: async () => mockTenants.list,
  };
});

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const { POST: casesPost } = await import("../../app/api/v1/tahsilat/cases/route");
const { readData } = await import("../store");
const { ALL_MODE_WRITE_DENIED_MESSAGE } = await import("../institution/write-scope");

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/tahsilat/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  mockCookieValue.value = undefined;
  mockUser.value = { userId: "u1", role: "SCHOOL_ADMIN", tenantId: DEFAULT_TENANT_ID };
  mockTenants.list = [{ tenantId: DEFAULT_TENANT_ID, name: "Nilüfer Açar Müzik Akademisi" }];
});

describe("Yazma kapsamı koruması — Tahsilat API rotası (/api/v1/tahsilat/cases)", () => {
  it("HYPER_ADMIN 'Tüm kurumlar' modunda (varsayılan) tam Türkçe mesajla reddedilir", async () => {
    mockUser.value = { userId: "hyper1", role: "HYPER_ADMIN", tenantId: PLATFORM_TENANT_ID };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "A" },
      { tenantId: "tenant_other", name: "B" },
    ];
    const before = await readData();
    const res = await casesPost(
      jsonRequest({
        paymentId: "p1",
        studentId: "s1",
        status: "draft",
        messageDraft: "test",
        attributedAmount: 0,
      })
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.message).toBe(ALL_MODE_WRITE_DENIED_MESSAGE);

    const after = await readData();
    expect(after).toEqual(before);
  });

  it("SCHOOL_ADMIN sahte kurum cookie'siyle bile yalnızca kendi kurumuna yazar", async () => {
    mockCookieValue.value = "tenant_forged_other_school";
    const res = await casesPost(
      jsonRequest({
        paymentId: "p1",
        studentId: "s1",
        status: "draft",
        messageDraft: "test",
        attributedAmount: 0,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.tenantId).toBe(DEFAULT_TENANT_ID);
  });

  it("tek bir geçerli kurum seçiliyken mutasyon başarılı olur", async () => {
    mockUser.value = { userId: "super1", role: "SUPER_ADMIN", tenantId: DEFAULT_TENANT_ID };
    mockCookieValue.value = DEFAULT_TENANT_ID;
    const res = await casesPost(
      jsonRequest({
        paymentId: "p1",
        studentId: "s1",
        status: "draft",
        messageDraft: "test",
        attributedAmount: 0,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
