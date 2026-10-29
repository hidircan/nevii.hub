import { describe, it, expect, beforeEach } from "vitest";
import { resetPlatformStoreForTests } from "../platform/store";
import { __resetSaasBillingStoreForTests } from "../saas-billing/store";
import {
  createDocRevision,
  setDocReview,
  publishDocRevision,
  getEffectiveDocs,
  getDocsApprovalStatusAsync,
  validateDocAcceptanceAsync,
} from "../saas-billing/legal-doc-store";

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
});

const hyper = { role: "HYPER_ADMIN", userId: "u-h", tenantId: "t-h", channel: "web" } as never;
const stranger = { role: "SCHOOL_ADMIN", userId: "u-s", tenantId: "t-s", channel: "web" } as never;
const TEXT = "Bu sentetik bir hukuk taslağı metnidir; gerçek sözleşme değildir. ".repeat(3);

describe("hukuki belge yönetimi (§6)", () => {
  it("yetkisiz rol revizyon/yayın yapamaz", async () => {
    expect((await createDocRevision(stranger, { docId: "saas-service-terms", bodyText: TEXT, source: "neviios" })).ok).toBe(false);
    expect((await publishDocRevision(stranger, { docId: "saas-service-terms", version: "x" })).ok).toBe(false);
  });

  it("revizyon → iki onay → yayın akışı; onaysız yayın engellenir", async () => {
    const r = await createDocRevision(hyper, { docId: "saas-service-terms", bodyText: TEXT, source: "neviiads-aktarim" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.source).toBe("neviiads-aktarim");
    expect(r.data.legalReview).toBe("bekliyor");
    // Onaysız yayın engeli
    expect((await publishDocRevision(hyper, { docId: "saas-service-terms", version: r.data.version })).ok).toBe(false);
    // Tek onay yetmez
    await setDocReview(hyper, { docId: "saas-service-terms", version: r.data.version, field: "legalReview", value: "onaylandi" });
    expect((await publishDocRevision(hyper, { docId: "saas-service-terms", version: r.data.version })).ok).toBe(false);
    await setDocReview(hyper, { docId: "saas-service-terms", version: r.data.version, field: "commercial", value: "onaylandi" });
    const p = await publishDocRevision(hyper, { docId: "saas-service-terms", version: r.data.version });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.data.publishedVersion).toBe(r.data.version);
    // Yürürlükteki metin yayında
    const docs = await getEffectiveDocs();
    const eff = docs.find((d) => d.id === "saas-service-terms");
    expect(eff?.approved).toBe(true);
    expect(eff?.bodyText).toBe(TEXT.trim());
    expect(eff?.version).toBe(r.data.version);
  });

  it("yayınlanan sürüm yerinde değişmez; yeni revizyon yeni sürüm açar", async () => {
    const r1 = await createDocRevision(hyper, { docId: "renewal-cancel-refund", bodyText: TEXT, source: "neviios" });
    if (!r1.ok) return;
    const r2 = await createDocRevision(hyper, { docId: "renewal-cancel-refund", bodyText: `${TEXT} Ek cümle.`, source: "neviios" });
    if (!r2.ok) return;
    expect(r2.data.version).not.toBe(r1.data.version);
  });

  it("yayından kaldırma geri dönüş sağlar", async () => {
    const r = await createDocRevision(hyper, { docId: "kvkk-notice", bodyText: TEXT, source: "neviios" });
    if (!r.ok) return;
    await setDocReview(hyper, { docId: "kvkk-notice", version: r.data.version, field: "legalReview", value: "onaylandi" });
    await setDocReview(hyper, { docId: "kvkk-notice", version: r.data.version, field: "commercial", value: "onaylandi" });
    await publishDocRevision(hyper, { docId: "kvkk-notice", version: r.data.version });
    const u = await publishDocRevision(hyper, { docId: "kvkk-notice", version: null });
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    expect(u.data.publishedVersion).toBeNull();
  });

  it("kabul doğrulaması yürürlükteki sürümü ister", async () => {
    const before = await validateDocAcceptanceAsync({ "saas-service-terms": "2026-10-30-d2", "renewal-cancel-refund": "2026-10-30-d2" });
    expect(before.ok).toBe(true);
    const r = await createDocRevision(hyper, { docId: "saas-service-terms", bodyText: TEXT, source: "neviios" });
    if (!r.ok) return;
    await setDocReview(hyper, { docId: "saas-service-terms", version: r.data.version, field: "legalReview", value: "onaylandi" });
    await setDocReview(hyper, { docId: "saas-service-terms", version: r.data.version, field: "commercial", value: "onaylandi" });
    await publishDocRevision(hyper, { docId: "saas-service-terms", version: r.data.version });
    // Eski sürüm artık bayat
    const stale = await validateDocAcceptanceAsync({ "saas-service-terms": "2026-10-30-d2", "renewal-cancel-refund": "2026-10-30-d2" });
    expect(stale.ok).toBe(false);
    // Kilit yalnız 2 sözleşme yayındayken açılır (diğeri hâlâ taslak)
    const status = await getDocsApprovalStatusAsync();
    expect(status.allApproved).toBe(false);
    expect(status.pending).toContain("Yenileme, İptal ve İade Koşulları");
  });
});
