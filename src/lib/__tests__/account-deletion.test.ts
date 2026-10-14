import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import {
  cancelMyDeletionRequestTool,
  decideAccountDeletionRequestTool,
  getMyDeletionRequestTool,
  listAccountDeletionRequestsTool,
  requestAccountDeletionTool,
} from "../services/account-deletion-tools";
import { ACCOUNT_DELETION_REQUESTS_FILE } from "../account-deletion";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const TEACHER_USER = "user_teacher_t1";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "TEACHER",
    userId: TEACHER_USER,
    tenantId: DEFAULT_TENANT_ID,
    teacherId: "t1",
    channel: "mobile",
    ...overrides,
  };
}

// Rate-limit (kullanıcı başına saatte 3) process-içi sayıldığından her
// talep-açan test ayrı bir seed kullanıcıyla çalışır.
const asStudent = () => ctx({ role: "STUDENT", userId: "user_student_s1", teacherId: undefined, studentId: "s1" });
const asAdminSelf = () => ctx({ role: "SCHOOL_ADMIN", userId: "user_manager_ezgi", teacherId: undefined });

const admin = () => ctx({ role: "SCHOOL_ADMIN", userId: "u_admin_hesap" });

beforeEach(async () => {
  await fs.rm(ACCOUNT_DELETION_REQUESTS_FILE, { force: true });
});

describe("requestAccountDeletionTool — self-service", () => {
  it("onaysız istek VALIDATION_ERROR", async () => {
    const res = await requestAccountDeletionTool(ctx(), { reason: "test" });
    expect(res.ok).toBe(false);
  });

  it("onaylı istek oluşturur; tekrar istek idempotent (aynı kayıt)", async () => {
    const first = await requestAccountDeletionTool(ctx(), { confirm: true, reason: "Artık kullanmıyorum" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.created).toBe(true);
    expect(first.data.request.status).toBe("pending");

    const again = await requestAccountDeletionTool(ctx(), { confirm: true });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.data.created).toBe(false);
    expect(again.data.request.id).toBe(first.data.request.id);
  });

  it("bilinmeyen kullanıcı FORBIDDEN (başkası adına talep YOK)", async () => {
    const res = await requestAccountDeletionTool(ctx({ userId: "u_yok_boyle" }), { confirm: true });
    expect(res.ok).toBe(false);
  });

  it("kendi durumunu görür; bekleyen talebi geri çeker", async () => {
    await requestAccountDeletionTool(asStudent(), { confirm: true });
    const mine = await getMyDeletionRequestTool(asStudent());
    expect(mine.ok && mine.data.open?.status).toBe("pending");
    const cancel = await cancelMyDeletionRequestTool(asStudent());
    expect(cancel.ok && cancel.data.request.status).toBe("cancelled");
    const after = await getMyDeletionRequestTool(asStudent());
    expect(after.ok && after.data.open).toBeNull();
  });
});

describe("admin karar akışı", () => {
  it("TEACHER/STUDENT listeleyemez ve karar veremez", async () => {
    await requestAccountDeletionTool(ctx(), { confirm: true });
    expect((await listAccountDeletionRequestsTool(ctx())).ok).toBe(false);
    expect((await listAccountDeletionRequestsTool(ctx({ role: "STUDENT", userId: "u_s" }))).ok).toBe(false);
    expect(
      (await decideAccountDeletionRequestTool(ctx(), { requestId: "x", status: "approved" })).ok
    ).toBe(false);
  });

  it("pending → approved → processed; stale karar CONFLICT", async () => {
    const created = await requestAccountDeletionTool(asAdminSelf(), { confirm: true });
    if (!created.ok) throw new Error("setup failed");
    const id = created.data.request.id;

    const list = await listAccountDeletionRequestsTool(admin());
    expect(list.ok && list.data.requests.map((r) => r.id)).toContain(id);

    const approve = await decideAccountDeletionRequestTool(admin(), { requestId: id, status: "approved" });
    expect(approve.ok).toBe(true);

    const approveAgain = await decideAccountDeletionRequestTool(admin(), { requestId: id, status: "approved" });
    expect(approveAgain.ok).toBe(false);
    if (!approveAgain.ok) expect(approveAgain.error.code).toBe("CONFLICT");

    const done = await decideAccountDeletionRequestTool(admin(), {
      requestId: id,
      status: "processed",
      decisionNote: "Retention'a uygun işlem tamamlandı",
    });
    expect(done.ok && done.data.request.status).toBe("processed");
  });

  it("bilinmeyen talep NOT_FOUND", async () => {
    const res = await decideAccountDeletionRequestTool(admin(), { requestId: "yok", status: "rejected" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });
});
