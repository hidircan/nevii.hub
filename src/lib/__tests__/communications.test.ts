import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { COMMUNICATION_MESSAGES_FILE, getCommunicationMessage, listCommunicationMessages } from "../communications/store";
import {
  approveCommunicationMessageTool,
  bulkApproveCommunicationMessagesTool,
  createCommunicationDraft,
  createMakeupLessonCommunicationDrafts,
  editCommunicationMessageTool,
  listCommunicationMessagesTool,
  MAX_BULK_APPROVE_BATCH,
} from "../communications/service";
import { assertCommunicationTransition, canTransitionCommunication, CommunicationTransitionError } from "../communications/status";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "user_admin", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

const OTHER_TENANT = "tenant_other_comm_test";

beforeEach(async () => {
  await fs.rm(COMMUNICATION_MESSAGES_FILE, { force: true });
  process.env.SMS_TEST_MODE = "true";
  process.env.SMS_TEST_ALLOWED_RECIPIENTS = "+905551112233";
});

describe("communications state machine", () => {
  it("allows pending_approval -> approved and rejects delivered -> draft", () => {
    expect(canTransitionCommunication("pending_approval", "approved")).toBe(true);
    expect(canTransitionCommunication("delivered", "draft")).toBe(false);
    expect(() => assertCommunicationTransition("delivered", "draft")).toThrow(CommunicationTransitionError);
  });

  it("allows approved -> pending_approval (edit invalidation) but not approved -> draft", () => {
    expect(canTransitionCommunication("approved", "pending_approval")).toBe(true);
    expect(canTransitionCommunication("approved", "draft")).toBe(false);
  });
});

describe("createCommunicationDraft idempotency", () => {
  it("does not create a duplicate for the same tenant+resource+recipient+channel", async () => {
    const input = {
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT" as const,
      recipientId: "student_1",
      recipientName: "Ayşe Veli",
      recipientPhone: "+905551112233",
      channel: "SMS" as const,
      messageType: "MAKEUP_LESSON" as const,
      resourceType: "makeup" as const,
      resourceId: "lesson_abc",
      body: "Telafi dersi planlandı.",
      createdBy: "user_admin",
    };
    const first = await createCommunicationDraft(input);
    const second = await createCommunicationDraft(input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);

    const all = await listCommunicationMessages(DEFAULT_TENANT_ID);
    expect(all.filter((m) => m.resourceId === "lesson_abc")).toHaveLength(1);
  });

  it("marks a record blocked when phone is missing, without throwing", async () => {
    const { record } = await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "student_2",
      recipientName: "Telefonsuz Veli",
      recipientPhone: "",
      channel: "SMS",
      messageType: "MAKEUP_LESSON",
      resourceType: "makeup",
      resourceId: "lesson_nophone",
      body: "Telafi dersi planlandı.",
      createdBy: "user_admin",
    });
    expect(record.status).toBe("blocked");
    expect(record.blockedReasonCode).toBe("invalid_phone");
  });
});

describe("single approval", () => {
  it("snapshots the draft body on approve and blocks a second edit from silently reusing the old snapshot", async () => {
    const { record } = await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "student_4",
      recipientName: "Veli Dört",
      recipientPhone: "+905551112233",
      channel: "SMS",
      messageType: "COLLECTION",
      resourceType: "payment",
      resourceId: "payment_1",
      body: "Ödeme hatırlatması.",
      createdBy: "user_admin",
    });

    const approved = await approveCommunicationMessageTool(ctx(), { id: record.id });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.data.message.status).toBe("approved");
    expect(approved.data.message.approvedBodySnapshot).toBe("Ödeme hatırlatması.");

    const edited = await editCommunicationMessageTool(ctx(), { id: record.id, draftBody: "Yeni metin." });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.data.message.status).toBe("pending_approval");
    expect(edited.data.message.approvedBodySnapshot).toBeUndefined();
  });

  it("rejects approval from a non-admin role", async () => {
    const { record } = await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "student_5",
      recipientName: "Veli Beş",
      recipientPhone: "+905551112233",
      channel: "SMS",
      messageType: "OTHER",
      resourceType: "other",
      resourceId: "other_1",
      body: "Test.",
      createdBy: "user_admin",
    });
    const result = await approveCommunicationMessageTool(ctx({ role: "TEACHER" }), { id: record.id });
    expect(result.ok).toBe(false);
  });

  it("duplicate approve calls are idempotent (second call is a no-op re-approve, no error)", async () => {
    const { record } = await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "student_6",
      recipientName: "Veli Altı",
      recipientPhone: "+905551112233",
      channel: "SMS",
      messageType: "OTHER",
      resourceType: "other",
      resourceId: "other_2",
      body: "Test.",
      createdBy: "user_admin",
    });
    const first = await approveCommunicationMessageTool(ctx(), { id: record.id });
    const second = await approveCommunicationMessageTool(ctx(), { id: record.id });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it("cross-tenant lookup returns NOT_FOUND, not the other tenant's message", async () => {
    const { record } = await createCommunicationDraft({
      tenantId: OTHER_TENANT,
      recipientType: "PARENT",
      recipientId: "student_x",
      recipientName: "Başka Kurum Veli",
      recipientPhone: "+905551112233",
      channel: "SMS",
      messageType: "OTHER",
      resourceType: "other",
      resourceId: "other_x",
      body: "Test.",
      createdBy: "user_admin",
    });
    const result = await approveCommunicationMessageTool(ctx({ tenantId: DEFAULT_TENANT_ID }), { id: record.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("bulk approval", () => {
  it("approves only draft/pending_approval rows and reports skipped for others", async () => {
    const a = await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "s7",
      recipientName: "V7",
      recipientPhone: "+905551112233",
      channel: "SMS",
      messageType: "OTHER",
      resourceType: "other",
      resourceId: "bulk_a",
      body: "A",
      createdBy: "user_admin",
    });
    const b = await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "s8",
      recipientName: "V8",
      recipientPhone: "",
      channel: "SMS",
      messageType: "OTHER",
      resourceType: "other",
      resourceId: "bulk_b",
      body: "B",
      createdBy: "user_admin",
    });

    const result = await bulkApproveCommunicationMessagesTool(ctx(), {
      ids: [a.record.id, b.record.id],
      confirm: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.approvedCount).toBe(1);
    expect(result.data.skippedCount).toBe(1);

    const approvedRow = await getCommunicationMessage(DEFAULT_TENANT_ID, a.record.id);
    const blockedRow = await getCommunicationMessage(DEFAULT_TENANT_ID, b.record.id);
    expect(approvedRow?.status).toBe("approved");
    expect(blockedRow?.status).toBe("blocked");
  });

  it("enforces the max batch size server-side", async () => {
    const ids = Array.from({ length: MAX_BULK_APPROVE_BATCH + 1 }, (_, i) => `nonexistent_${i}`);
    const result = await bulkApproveCommunicationMessagesTool(ctx(), { ids, confirm: true });
    expect(result.ok).toBe(false);
  });

  it("re-running the same bulk approve request does not double-approve or error", async () => {
    const { record } = await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "s9",
      recipientName: "V9",
      recipientPhone: "+905551112233",
      channel: "SMS",
      messageType: "OTHER",
      resourceType: "other",
      resourceId: "bulk_retry",
      body: "C",
      createdBy: "user_admin",
    });
    const first = await bulkApproveCommunicationMessagesTool(ctx(), { ids: [record.id], confirm: true });
    const second = await bulkApproveCommunicationMessagesTool(ctx(), { ids: [record.id], confirm: true });
    expect(first.ok && first.data.approvedCount).toBe(1);
    // second run: already approved -> not in BULK_SELECTABLE_STATUSES -> skipped, not re-approved/duplicated
    expect(second.ok && second.data.skippedCount).toBe(1);
  });

  it("rejects bulk approve without the second confirmation flag", async () => {
    const { record } = await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "s10",
      recipientName: "V10",
      recipientPhone: "+905551112233",
      channel: "SMS",
      messageType: "OTHER",
      resourceType: "other",
      resourceId: "bulk_noconfirm",
      body: "D",
      createdBy: "user_admin",
    });
    // @ts-expect-error intentionally omitting the literal-true confirm to prove server-side rejection
    const result = await bulkApproveCommunicationMessagesTool(ctx(), { ids: [record.id], confirm: false });
    expect(result.ok).toBe(false);
  });
});

describe("makeup lesson integration", () => {
  it("creates idempotent SMS + WhatsApp drafts for the parent, blocked when opted out", async () => {
    const created = await createMakeupLessonCommunicationDrafts({
      tenantId: DEFAULT_TENANT_ID,
      lessonId: "lesson_makeup_1",
      createdBy: "user_admin",
      parent: {
        name: "Telafi Veli",
        phone: "+905551112233",
        studentId: "student_makeup_1",
        optOut: false,
        smsBody: "Telafi dersi SMS metni",
        whatsappBody: "Telafi dersi WhatsApp metni",
      },
    });
    expect(created.sms.status).toBe("pending_approval");
    expect(created.whatsapp.status).toBe("pending_approval");
    expect(created.sms.messageType).toBe("MAKEUP_LESSON");

    // retry (e.g. duplicate confirm click) must not create a second pair
    await createMakeupLessonCommunicationDrafts({
      tenantId: DEFAULT_TENANT_ID,
      lessonId: "lesson_makeup_1",
      createdBy: "user_admin",
      parent: {
        name: "Telafi Veli",
        phone: "+905551112233",
        studentId: "student_makeup_1",
        optOut: false,
        smsBody: "Telafi dersi SMS metni",
        whatsappBody: "Telafi dersi WhatsApp metni",
      },
    });
    const all = await listCommunicationMessages(DEFAULT_TENANT_ID);
    expect(all.filter((m) => m.resourceId === "lesson_makeup_1")).toHaveLength(2);
  });

  it("blocks drafts (does not throw) when the parent has opted out", async () => {
    const created = await createMakeupLessonCommunicationDrafts({
      tenantId: DEFAULT_TENANT_ID,
      lessonId: "lesson_makeup_optout",
      createdBy: "user_admin",
      parent: {
        name: "Opt-out Veli",
        phone: "+905551112233",
        studentId: "student_optout",
        optOut: true,
        smsBody: "SMS",
        whatsappBody: "WA",
      },
    });
    expect(created.sms.status).toBe("blocked");
    expect(created.whatsapp.status).toBe("blocked");
    expect(created.sms.blockedReasonCode).toBe("opt_out");
  });
});

describe("RBAC + tenant isolation matrix", () => {
  it("TEACHER/PARENT/STUDENT cannot list, edit, approve or bulk-approve", async () => {
    const { record } = await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "s_rbac",
      recipientName: "V RBAC",
      recipientPhone: "+905551112233",
      channel: "WHATSAPP",
      messageType: "OTHER",
      resourceType: "other",
      resourceId: "rbac_1",
      body: "Test.",
      createdBy: "user_admin",
    });

    for (const role of ["TEACHER", "STUDENT"] as const) {
      const c = ctx({ role });
      expect((await listCommunicationMessagesTool(c)).ok).toBe(false);
      expect((await editCommunicationMessageTool(c, { id: record.id, draftBody: "x" })).ok).toBe(false);
      expect((await approveCommunicationMessageTool(c, { id: record.id })).ok).toBe(false);
      expect((await bulkApproveCommunicationMessagesTool(c, { ids: [record.id], confirm: true })).ok).toBe(false);
    }
  });

  it("SUPER_ADMIN bypasses the role gate (platform-wide admin)", async () => {
    const { record } = await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "s_super",
      recipientName: "V Super",
      recipientPhone: "+905551112233",
      channel: "WHATSAPP",
      messageType: "OTHER",
      resourceType: "other",
      resourceId: "super_1",
      body: "Test.",
      createdBy: "user_admin",
    });
    const result = await approveCommunicationMessageTool(ctx({ role: "SUPER_ADMIN" }), { id: record.id });
    expect(result.ok).toBe(true);
  });

  it("bulk approve never crosses tenant boundaries even when an admin from tenant A submits tenant B's message id", async () => {
    const { record: otherTenantMsg } = await createCommunicationDraft({
      tenantId: OTHER_TENANT,
      recipientType: "PARENT",
      recipientId: "s_cross",
      recipientName: "V Cross",
      recipientPhone: "+905551112233",
      channel: "WHATSAPP",
      messageType: "OTHER",
      resourceType: "other",
      resourceId: "cross_1",
      body: "Test.",
      createdBy: "user_admin",
    });
    const result = await bulkApproveCommunicationMessagesTool(ctx({ tenantId: DEFAULT_TENANT_ID }), {
      ids: [otherTenantMsg.id],
      confirm: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.approvedCount).toBe(0);
    expect(result.data.failedCount).toBe(1);

    // the other tenant's record must remain untouched
    const untouched = await getCommunicationMessage(OTHER_TENANT, otherTenantMsg.id);
    expect(untouched?.status).toBe("pending_approval");
  });

  it("listCommunicationMessagesTool only returns the caller's own tenant", async () => {
    await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "s_own",
      recipientName: "V Own",
      recipientPhone: "+905551112233",
      channel: "WHATSAPP",
      messageType: "OTHER",
      resourceType: "other",
      resourceId: "own_1",
      body: "Test.",
      createdBy: "user_admin",
    });
    await createCommunicationDraft({
      tenantId: OTHER_TENANT,
      recipientType: "PARENT",
      recipientId: "s_other",
      recipientName: "V Other",
      recipientPhone: "+905551112233",
      channel: "WHATSAPP",
      messageType: "OTHER",
      resourceType: "other",
      resourceId: "other_tenant_1",
      body: "Test.",
      createdBy: "user_admin",
    });
    const result = await listCommunicationMessagesTool(ctx({ tenantId: DEFAULT_TENANT_ID }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.messages.every((m) => m.resourceId !== "other_tenant_1")).toBe(true);
  });
});
