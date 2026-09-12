import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServiceContext } from "../services/context";

const mockCookieValue: { value: string | undefined } = { value: undefined };
const mockTenants: { list: { tenantId: string; name: string }[] } = {
  list: [{ tenantId: "tenant_a", name: "A Akademi" }],
};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "notaplan_kurum" && mockCookieValue.value !== undefined
        ? { value: mockCookieValue.value }
        : undefined,
    set: () => {},
  }),
}));

vi.mock("../store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../store")>();
  return {
    ...actual,
    listTenants: async () => mockTenants.list,
  };
});

const { resolveWriteScope } = await import("../institution/write-scope");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: "tenant_a",
    channel: "web",
    ...overrides,
  };
}

beforeEach(() => {
  mockCookieValue.value = undefined;
  mockTenants.list = [
    { tenantId: "tenant_a", name: "A Akademi" },
    { tenantId: "tenant_b", name: "B Akademi" },
  ];
});

describe("resolveWriteScope — SCHOOL_ADMIN", () => {
  it("tercih yokken kendi kurumunda yazma iznine sahiptir", async () => {
    const scope = await resolveWriteScope(ctx({ role: "SCHOOL_ADMIN", tenantId: "tenant_a" }));
    expect(scope).toEqual({ mode: "single", tenantId: "tenant_a" });
  });

  it("sahte/başka bir kurumun cookie'si yazmayı diğer kuruma sızdırmaz — kendi kurumuna düşer", async () => {
    mockCookieValue.value = "tenant_b";
    const scope = await resolveWriteScope(ctx({ role: "SCHOOL_ADMIN", tenantId: "tenant_a" }));
    expect(scope).toEqual({ mode: "single", tenantId: "tenant_a" });
  });

  it("'ALL' cookie'si SCHOOL_ADMIN için geçersizdir — kendi kurumuna düşer", async () => {
    mockCookieValue.value = "ALL";
    const scope = await resolveWriteScope(ctx({ role: "SCHOOL_ADMIN", tenantId: "tenant_a" }));
    expect(scope).toEqual({ mode: "single", tenantId: "tenant_a" });
  });

  it("var olmayan bir tenant id'si istenirse kendi kurumuna düşer", async () => {
    mockCookieValue.value = "tenant_does_not_exist";
    const scope = await resolveWriteScope(ctx({ role: "SCHOOL_ADMIN", tenantId: "tenant_a" }));
    expect(scope).toEqual({ mode: "single", tenantId: "tenant_a" });
  });
});

describe("resolveWriteScope — SUPER_ADMIN", () => {
  it("tercih yokken kendi kurumunda yazar — başka kurumu birleştirmez", async () => {
    const scope = await resolveWriteScope(ctx({ role: "SUPER_ADMIN", tenantId: "tenant_a" }));
    expect(scope).toEqual({ mode: "single", tenantId: "tenant_a" });
  });

  it("açıkça 'ALL' seçiliyken geçersiz sayılır, kendi kurumuna düşer", async () => {
    mockCookieValue.value = "ALL";
    const scope = await resolveWriteScope(ctx({ role: "SUPER_ADMIN", tenantId: "tenant_a" }));
    expect(scope).toEqual({ mode: "single", tenantId: "tenant_a" });
  });

  it("başka kurum cookie'si SUPER_ADMIN için sızdırmaz — kendi kurumuna düşer", async () => {
    mockCookieValue.value = "tenant_b";
    const scope = await resolveWriteScope(ctx({ role: "SUPER_ADMIN", tenantId: "tenant_a" }));
    expect(scope).toEqual({ mode: "single", tenantId: "tenant_a" });
  });

  it("kendi kurumunu seçtiğinde tek kurum modunda yazma izni verir", async () => {
    mockCookieValue.value = "tenant_a";
    const scope = await resolveWriteScope(ctx({ role: "SUPER_ADMIN", tenantId: "tenant_a" }));
    expect(scope).toEqual({ mode: "single", tenantId: "tenant_a" });
  });

  it("erişilemeyen bir tenant id'si istenirse kendi kurumuna düşer, sızdırmaz", async () => {
    mockCookieValue.value = "tenant_does_not_exist";
    const scope = await resolveWriteScope(ctx({ role: "SUPER_ADMIN", tenantId: "tenant_a" }));
    expect(scope).toEqual({ mode: "single", tenantId: "tenant_a" });
  });
});
