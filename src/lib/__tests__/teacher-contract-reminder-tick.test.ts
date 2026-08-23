import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createTeacherTool, archiveTeacherTool, updateTeacherProfileTool } from "../services/tools";
import { NOTIFICATIONS_FILE, listAllNotifications } from "../notifications";
import { runTeacherContractReminderTick } from "../teacher-contract-reminder-tick";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "user_admin",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
});

function ymdDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function createTeacherWithContractEnd(contractEndDate: string) {
  const res = await createTeacherTool(ctx(), {
    name: "Sözleşme Testi Öğretmeni",
    email: `sozlesme-${Date.now()}-${Math.random()}@okul.com`,
    phone: "5551110022",
    branchId: "erzene",
    instrument: "Piyano",
    contractStartDate: "2024-01-01",
    contractEndDate,
  });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.teacherId;
}

describe("Öğretmen sözleşme bitiş hatırlatma tick motoru", () => {
  it("30 gün kala bildirim üretir", async () => {
    await createTeacherWithContractEnd(ymdDaysFromNow(30));
    const summary = await runTeacherContractReminderTick();
    expect(summary.remindersCreated).toBeGreaterThanOrEqual(1);
  });

  it("31 gün kala üretmez", async () => {
    await createTeacherWithContractEnd(ymdDaysFromNow(31));
    const summary = await runTeacherContractReminderTick();
    expect(summary.remindersCreated).toBe(0);
  });

  it("bitiş geçmişse üretmez", async () => {
    await createTeacherWithContractEnd(ymdDaysFromNow(-1));
    const summary = await runTeacherContractReminderTick();
    expect(summary.remindersCreated).toBe(0);
  });

  it("pasif öğretmeni atlar", async () => {
    const teacherId = await createTeacherWithContractEnd(ymdDaysFromNow(10));
    const archived = await archiveTeacherTool(ctx(), { teacherId, archived: true });
    expect(archived.ok).toBe(true);

    const summary = await runTeacherContractReminderTick();
    expect(summary.remindersCreated).toBe(0);
  });

  it("aynı öğretmen + aynı bitiş + aynı yönetici için ikinci tick duplicate üretmez", async () => {
    await createTeacherWithContractEnd(ymdDaysFromNow(5));
    const first = await runTeacherContractReminderTick();
    expect(first.remindersCreated).toBeGreaterThanOrEqual(1);

    const second = await runTeacherContractReminderTick();
    expect(second.remindersCreated).toBe(0);
    expect(second.duplicatesSkipped).toBeGreaterThanOrEqual(1);
  });

  it("bitiş tarihi değişince yeni bildirim üretir", async () => {
    const teacherId = await createTeacherWithContractEnd(ymdDaysFromNow(5));
    const first = await runTeacherContractReminderTick();
    expect(first.remindersCreated).toBeGreaterThanOrEqual(1);

    const updated = await updateTeacherProfileTool(ctx(), {
      teacherId,
      contractEndDate: ymdDaysFromNow(20),
    });
    expect(updated.ok).toBe(true);

    const second = await runTeacherContractReminderTick();
    expect(second.remindersCreated).toBeGreaterThanOrEqual(1);
  });

  it("birden çok yönetici varsa her biri kendi tek bildirimini alır", async () => {
    await createTeacherWithContractEnd(ymdDaysFromNow(3));
    await runTeacherContractReminderTick();

    const notifications = await listAllNotifications(DEFAULT_TENANT_ID);
    const contractNotifs = notifications.filter((n) => n.kind.startsWith("teacher_contract_expiring:"));
    const recipients = new Set(contractNotifs.map((n) => n.targetUserId));
    // Bootstrap DEFAULT_TENANT_ID admin/super admin kullanıcıları — her biri tam olarak 1 bildirim.
    expect(recipients.size).toBeGreaterThanOrEqual(2);
    for (const userId of recipients) {
      expect(contractNotifs.filter((n) => n.targetUserId === userId)).toHaveLength(1);
    }
  });

  it("öğretmene/veliye dış mesaj gönderilmez — yalnızca admin/super admin hedeflenir", async () => {
    await createTeacherWithContractEnd(ymdDaysFromNow(3));
    await runTeacherContractReminderTick();

    const notifications = await listAllNotifications(DEFAULT_TENANT_ID);
    const contractNotifs = notifications.filter((n) => n.kind.startsWith("teacher_contract_expiring:"));
    expect(contractNotifs.length).toBeGreaterThan(0);
    for (const n of contractNotifs) {
      expect(["user_super", "user_admin", "user_owner_nilufer", "user_manager_ezgi"]).toContain(n.targetUserId);
    }
  });
});
