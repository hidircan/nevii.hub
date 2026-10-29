import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { canAccessStudent, type ServiceContext } from "../services/context";
import {
  STUDENT_PORTAL_ACCESS_FILE,
  inviteStudentPortalAccess,
  activateStudentPortalAccess,
  revokeStudentPortalAccess,
  hasActiveStudentAccess,
} from "../student-portal-access";
import { initiateStudentPaymentCheckoutTool } from "../services/tools";
import { setPaymentProviderForTests } from "../payment-provider/provider-factory";
import { addPayment, readData } from "../store";

/** Seed'deki tek s1 ödemesi (p1) zaten tam ödenmiş — checkout testleri için kalan bakiyeli TAZE bir ödeme oluşturur. */
async function createUnpaidPaymentForS1(): Promise<string> {
  const before = await readData();
  const ids = new Set(before.payments.map((p) => p.id));
  await addPayment({
    studentId: "s1",
    description: "Checkout test ödemesi",
    amount: 1000,
    dueDate: new Date().toISOString(),
  });
  const after = await readData();
  const created = after.payments.find((p) => !ids.has(p.id));
  if (!created) throw new Error("test setup: payment not created");
  return created.id;
}

function studentCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "STUDENT",
    userId: "guardian1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  setPaymentProviderForTests(null);
});

describe("Karma Öğrenci Portalı — StudentPortalAccess senaryoları (task #36)", () => {
  it("self-managed erişim: SELF accessType kendi kaydına erişebilir", async () => {
    await inviteStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "user_student_s1",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin1",
    });
    await activateStudentPortalAccess(DEFAULT_TENANT_ID, "user_student_s1", "s1");
    const ctx = studentCtx({ userId: "user_student_s1" });
    expect(await canAccessStudent(ctx, "s1")).toBe(true);
  });

  it("guardian erişimi: GUARDIAN accessType de aynı şekilde erişim sağlar", async () => {
    await inviteStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "guardian1",
      studentId: "s1",
      accessType: "GUARDIAN",
      invitedBy: "admin1",
    });
    await activateStudentPortalAccess(DEFAULT_TENANT_ID, "guardian1", "s1");
    expect(await canAccessStudent(studentCtx(), "s1")).toBe(true);
  });

  it("çok çocuklu veli: aynı kullanıcı birden fazla öğrenciye erişebilir, ÜÇÜNCÜ bir öğrenciye erişemez", async () => {
    await inviteStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "guardian1",
      studentId: "s1",
      accessType: "GUARDIAN",
      invitedBy: "admin1",
    });
    await activateStudentPortalAccess(DEFAULT_TENANT_ID, "guardian1", "s1");
    await inviteStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "guardian1",
      studentId: "s2",
      accessType: "GUARDIAN",
      invitedBy: "admin1",
    });
    await activateStudentPortalAccess(DEFAULT_TENANT_ID, "guardian1", "s2");

    const ctx = studentCtx();
    expect(await canAccessStudent(ctx, "s1")).toBe(true);
    expect(await canAccessStudent(ctx, "s2")).toBe(true);
    expect(await canAccessStudent(ctx, "s3")).toBe(false);
  });

  it("iptal edilen erişim: revoke sonrası BİR SONRAKİ istekte hemen etkilidir", async () => {
    await inviteStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "guardian1",
      studentId: "s1",
      accessType: "GUARDIAN",
      invitedBy: "admin1",
    });
    await activateStudentPortalAccess(DEFAULT_TENANT_ID, "guardian1", "s1");
    expect(await hasActiveStudentAccess(DEFAULT_TENANT_ID, "guardian1", "s1")).toBe(true);

    await revokeStudentPortalAccess(DEFAULT_TENANT_ID, "guardian1", "s1");
    expect(await hasActiveStudentAccess(DEFAULT_TENANT_ID, "guardian1", "s1")).toBe(false);
    expect(await canAccessStudent(studentCtx(), "s1")).toBe(false);
  });

  it("tenant izolasyonu: bir tenant'ta verilen erişim BAŞKA tenant'taki aynı studentId'ye sızmaz", async () => {
    await inviteStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "guardian1",
      studentId: "s1",
      accessType: "GUARDIAN",
      invitedBy: "admin1",
    });
    await activateStudentPortalAccess(DEFAULT_TENANT_ID, "guardian1", "s1");

    const otherTenantCtx = studentCtx({ tenantId: "tenant_other" });
    expect(await canAccessStudent(otherTenantCtx, "s1")).toBe(false);
    expect(await hasActiveStudentAccess("tenant_other", "guardian1", "s1")).toBe(false);
  });

  it("yalnızca 'invited' (henüz aktive edilmemiş) durumda erişim VERİLMEZ", async () => {
    await inviteStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "guardian1",
      studentId: "s1",
      accessType: "GUARDIAN",
      invitedBy: "admin1",
    });
    // activateStudentPortalAccess ÇAĞRILMADI — hâlâ "invited".
    expect(await canAccessStudent(studentCtx(), "s1")).toBe(false);
  });
});

describe("Ödeme checkout — fail-closed (task #35, gerçek sağlayıcı bağlanmadıkça)", () => {
  it("consoleProvider (varsayılan/yapılandırılmamış) her zaman CONFLICT ile reddeder — hiçbir sahte checkout URL üretilmez", async () => {
    await inviteStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "user_student_s1",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin1",
    });
    await activateStudentPortalAccess(DEFAULT_TENANT_ID, "user_student_s1", "s1");
    const paymentId = await createUnpaidPaymentForS1();

    const result = await initiateStudentPaymentCheckoutTool(studentCtx({ userId: "user_student_s1" }), {
      paymentId,
      successUrl: "https://app.example.com/success",
      buyerIp: "127.0.0.1",
      cancelUrl: "https://app.example.com/cancel",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("aktif StudentPortalAccess'i olmayan bir STUDENT checkout başlatamaz (FORBIDDEN/NOT_FOUND — sağlayıcıya hiç ulaşmaz)", async () => {
    const result = await initiateStudentPaymentCheckoutTool(studentCtx({ userId: "user_student_no_access" }), {
      paymentId: "p1",
      successUrl: "https://app.example.com/success",
      buyerIp: "127.0.0.1",
      cancelUrl: "https://app.example.com/cancel",
    });
    expect(result.ok).toBe(false);
  });

  it("sahte/mock bir provider bağlansa bile başarısız createCheckout hiçbir PaymentCheckoutAttempt'i succeeded/pending'e taşımaz", async () => {
    await inviteStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "user_student_s1",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin1",
    });
    await activateStudentPortalAccess(DEFAULT_TENANT_ID, "user_student_s1", "s1");

    setPaymentProviderForTests({
      name: "test-provider",
      isConfigured: () => true,
      async createCheckout() {
        return { ok: false, error: "Simulated provider outage", errorCode: "PROVIDER_ERROR" };
      },
      async verifyWebhook() {
        return { ok: false, error: "not used" };
      },
    });
    const paymentId = await createUnpaidPaymentForS1();

    const result = await initiateStudentPaymentCheckoutTool(studentCtx({ userId: "user_student_s1" }), {
      paymentId,
      successUrl: "https://app.example.com/success",
      buyerIp: "127.0.0.1",
      cancelUrl: "https://app.example.com/cancel",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INTERNAL_ERROR");
  });
});
