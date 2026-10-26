import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetPlatformStoreForTests } from "../platform/store";
import { __resetSaasBillingStoreForTests } from "../saas-billing/store";
import {
  importAcceptedProposal,
  isNeviiAdsImportEnabled,
  verifyImportToken,
} from "../saas-billing/neviiads-import";

const TOKEN = "test-import-token-abc";

function input(over: Record<string, unknown> = {}) {
  return {
    proposalId: "prop_1",
    proposalVersion: 2,
    tenantId: "t_neviiads_1",
    planKey: "core",
    billingInterval: "monthly",
    termsVersion: "v2026.1",
    acceptedAt: "2026-02-01T00:00:00.000Z",
    acceptedByName: "Kurum Sahibi",
    acceptedByEmail: "sahip@kurum.com",
    ...over,
  };
}

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
  delete process.env.NEVIIADS_IMPORT_ENABLED;
  delete process.env.NEVIIADS_IMPORT_TOKEN;
});

afterEach(() => {
  delete process.env.NEVIIADS_IMPORT_ENABLED;
  delete process.env.NEVIIADS_IMPORT_TOKEN;
});

describe("neviiads aktarım", () => {
  it("varsayılan KAPALI", async () => {
    expect(isNeviiAdsImportEnabled()).toBe(false);
    const r = await importAcceptedProposal({ token: TOKEN, input: input(), createdBy: "t" });
    expect(r.ok).toBe(false);
  });

  it("jetonsuz/yanlış jetonla reddedilir", async () => {
    process.env.NEVIIADS_IMPORT_ENABLED = "true";
    process.env.NEVIIADS_IMPORT_TOKEN = TOKEN;
    expect(verifyImportToken("yanlis")).toBe(false);
    expect(verifyImportToken(null)).toBe(false);
    expect(verifyImportToken(TOKEN)).toBe(true);
    const r = await importAcceptedProposal({ token: "yanlis", input: input(), createdBy: "t" });
    expect(r.ok).toBe(false);
  });

  it("aynı teklifin yeniden aktarımı ikinci davet yaratmaz (idempotent)", async () => {
    process.env.NEVIIADS_IMPORT_ENABLED = "true";
    process.env.NEVIIADS_IMPORT_TOKEN = TOKEN;
    const a = await importAcceptedProposal({ token: TOKEN, input: input(), createdBy: "t" });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.data.duplicate).toBe(false);
    expect(a.data.token).toBeTruthy();
    expect(a.data.invitation.tokenHash).not.toBe(a.data.token);

    const b = await importAcceptedProposal({ token: TOKEN, input: input(), createdBy: "t" });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.data.duplicate).toBe(true);
    expect(b.data.token).toBeNull();
    expect(b.data.invitation.id).toBe(a.data.invitation.id);
  });

  it("istemcinin tutarı güvenilmez: sunucu katalogdan hesaplar", async () => {
    process.env.NEVIIADS_IMPORT_ENABLED = "true";
    process.env.NEVIIADS_IMPORT_TOKEN = TOKEN;
    const r = await importAcceptedProposal({
      token: TOKEN,
      input: input({ proposalId: "prop_2", displayAmountMinor: 1 }),
      createdBy: "t",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Yerleşik katalogda fiyat 0 (onaysız) → sunucu 0 yazar, istemcinin 1'ini değil.
    expect(r.data.invitation.displayAmountMinor).toBe(0);
  });
});
