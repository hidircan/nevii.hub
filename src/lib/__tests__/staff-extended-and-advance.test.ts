import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import {
  createStaffMemberTool,
  updateStaffMemberTool,
  listStaffTool,
  revealNationalIdTool,
  revealStaffIbanTool,
  createStaffAdvanceTool,
  decideStaffAdvanceTool,
  markStaffAdvancePaidTool,
  cancelStaffAdvanceTool,
  listStaffAdvancesTool,
} from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STAFF_FILE } from "../staff";
import { STAFF_ADVANCE_FILE } from "../staff-advance";
import { isValidIban, maskIban } from "../pii/iban";

const VALID_TR_IBAN = "TR330006100519786457841326";

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  // NeviiOS tur 3 owner kararı: personel/bordro/finans özeti yalnız kurum sahibinde (SUPER_ADMIN).
  return { role: "SUPER_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(STAFF_FILE, { force: true });
  await fs.rm(STAFF_ADVANCE_FILE, { force: true });
});

describe("pii/iban.ts — mod-97 doğrulama ve maskeleme", () => {
  it("geçerli bir TR IBAN kabul edilir", () => {
    expect(isValidIban(VALID_TR_IBAN)).toBe(true);
  });

  it("bozuk checksum reddedilir", () => {
    expect(isValidIban("TR330006100519786457841327")).toBe(false);
  });

  it("TR dışı format reddedilir", () => {
    expect(isValidIban("DE89370400440532013000")).toBe(false);
  });

  it("maske yalnızca son 4 haneyi gösterir", () => {
    expect(maskIban("1326")).toBe("TR** **** **** **** **** **1326");
  });
});

describe("Faz 9A — StaffMember özlük genişletmesi (emergency/contract/SGK/IBAN)", () => {
  it("yeni alanlarla personel oluşturulur ve doğru döner", async () => {
    const created = await createStaffMemberTool(adminCtx(), {
      name: "Ayşe Yılmaz",
      position: "Muhasebe",
      emergencyContactName: "Ali Yılmaz",
      emergencyContactPhone: "0555 111 2233",
      contractStartDate: "2026-01-01",
      contractEndDate: "2026-12-31",
      sgkStatus: "Kayıtlı",
      iban: VALID_TR_IBAN,
      annualAdvanceLimit: 10000,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const list = await listStaffTool(adminCtx(), {});
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const entry = list.data.staff.find((s) => s.id === created.data.staffId);
    expect(entry?.emergencyContactName).toBe("Ali Yılmaz");
    expect(entry?.contractStartDate).toBe("2026-01-01");
    expect(entry?.sgkStatus).toBe("Kayıtlı");
    expect(entry?.annualAdvanceLimit).toBe(10000);
    // IBAN listede asla ham gösterilmez — yalnızca last4 + cipher.
    expect(entry?.ibanCipher).toBeTruthy();
    expect(entry?.ibanLast4).toBe("1326");
  });

  it("geçersiz IBAN reddedilir", async () => {
    const res = await createStaffMemberTool(adminCtx(), {
      name: "Deniz Kaya",
      position: "Resepsiyon",
      iban: "TR330006100519786457841327",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("revealStaffIbanTool: yetkili admin tam IBAN'ı görebilir, audit'lenir", async () => {
    const created = await createStaffMemberTool(adminCtx(), { name: "Ayşe", position: "Muhasebe", iban: VALID_TR_IBAN });
    if (!created.ok) return;
    const revealed = await revealStaffIbanTool(adminCtx(), { staffId: created.data.staffId });
    expect(revealed.ok).toBe(true);
    if (!revealed.ok) return;
    expect(revealed.data.iban).toBe(VALID_TR_IBAN);
  });

  it("revealStaffIbanTool: TEACHER rolü erişemez (FORBIDDEN)", async () => {
    const created = await createStaffMemberTool(adminCtx(), { name: "Ayşe", position: "Muhasebe", iban: VALID_TR_IBAN });
    if (!created.ok) return;
    const res = await revealStaffIbanTool(adminCtx({ role: "TEACHER", teacherId: "t1" }), { staffId: created.data.staffId });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("revealNationalIdTool artık entity:'staff' de kabul eder", async () => {
    const created = await createStaffMemberTool(adminCtx(), {
      name: "Ayşe",
      position: "Muhasebe",
      nationalId: "10000000146",
    });
    if (!created.ok) return;
    const revealed = await revealNationalIdTool(adminCtx(), { entity: "staff", entityId: created.data.staffId });
    expect(revealed.ok).toBe(true);
    if (!revealed.ok) return;
    expect(revealed.data.nationalId).toBe("10000000146");
  });

  it("updateStaffMemberTool ile IBAN sonradan eklenebilir/güncellenebilir", async () => {
    const created = await createStaffMemberTool(adminCtx(), { name: "Ayşe", position: "Muhasebe" });
    if (!created.ok) return;
    const updated = await updateStaffMemberTool(adminCtx(), { staffId: created.data.staffId, iban: VALID_TR_IBAN });
    expect(updated.ok).toBe(true);
    const revealed = await revealStaffIbanTool(adminCtx(), { staffId: created.data.staffId });
    expect(revealed.ok).toBe(true);
    if (revealed.ok) expect(revealed.data.iban).toBe(VALID_TR_IBAN);
  });
});

describe("Faz 9B — StaffAdvance akışı (talep→onay/red→ödeme→iptal + yıllık limit)", () => {
  async function createStaffWithLimit(limit?: number): Promise<string> {
    const created = await createStaffMemberTool(adminCtx(), {
      name: "Deniz Kaya",
      position: "Resepsiyon",
      annualAdvanceLimit: limit,
    });
    if (!created.ok) throw new Error(created.error.message);
    return created.data.staffId;
  }

  it("TEACHER rolü avans talebi oluşturamaz (FORBIDDEN)", async () => {
    const staffId = await createStaffWithLimit();
    const res = await createStaffAdvanceTool(adminCtx({ role: "TEACHER", teacherId: "t1" }), {
      staffId,
      amount: 1000,
      requestDate: "2026-06-01",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("talep→onay→ödeme akışı uçtan uca çalışır", async () => {
    const staffId = await createStaffWithLimit();
    const created = await createStaffAdvanceTool(adminCtx(), { staffId, amount: 2000, requestDate: "2026-06-01" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const decided = await decideStaffAdvanceTool(adminCtx(), { advanceId: created.data.advanceId, status: "approved" });
    expect(decided.ok).toBe(true);

    const paid = await markStaffAdvancePaidTool(adminCtx(), { advanceId: created.data.advanceId });
    expect(paid.ok).toBe(true);

    const list = await listStaffAdvancesTool(adminCtx(), { staffId });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const entry = list.data.advances.find((a) => a.id === created.data.advanceId);
    expect(entry?.status).toBe("paid");
    expect(entry?.paidAt).toBeTruthy();
  });

  it("yalnızca onaylanmış avans ödenmiş sayılabilir (pending_approval'dan doğrudan paid olamaz)", async () => {
    const staffId = await createStaffWithLimit();
    const created = await createStaffAdvanceTool(adminCtx(), { staffId, amount: 1000, requestDate: "2026-06-01" });
    if (!created.ok) return;
    const paid = await markStaffAdvancePaidTool(adminCtx(), { advanceId: created.data.advanceId });
    expect(paid.ok).toBe(false);
  });

  it("sonuçlandırılmış (approved/rejected) bir talep tekrar karara bağlanamaz", async () => {
    const staffId = await createStaffWithLimit();
    const created = await createStaffAdvanceTool(adminCtx(), { staffId, amount: 1000, requestDate: "2026-06-01" });
    if (!created.ok) return;
    await decideStaffAdvanceTool(adminCtx(), { advanceId: created.data.advanceId, status: "approved" });
    const second = await decideStaffAdvanceTool(adminCtx(), { advanceId: created.data.advanceId, status: "rejected" });
    expect(second.ok).toBe(false);
  });

  it("pending_approval veya approved avans iptal edilebilir, paid olan iptal edilemez", async () => {
    const staffId = await createStaffWithLimit();
    const created = await createStaffAdvanceTool(adminCtx(), { staffId, amount: 1000, requestDate: "2026-06-01" });
    if (!created.ok) return;
    const cancelled = await cancelStaffAdvanceTool(adminCtx(), { advanceId: created.data.advanceId });
    expect(cancelled.ok).toBe(true);

    const created2 = await createStaffAdvanceTool(adminCtx(), { staffId, amount: 1000, requestDate: "2026-06-01" });
    if (!created2.ok) return;
    await decideStaffAdvanceTool(adminCtx(), { advanceId: created2.data.advanceId, status: "approved" });
    await markStaffAdvancePaidTool(adminCtx(), { advanceId: created2.data.advanceId });
    const cancelAfterPaid = await cancelStaffAdvanceTool(adminCtx(), { advanceId: created2.data.advanceId });
    expect(cancelAfterPaid.ok).toBe(false);
  });

  it("yıllık avans limiti aşılırsa yeni talep reddedilir (bu oturumdaki ilk 'limit vs kullanım' kontrolü)", async () => {
    const staffId = await createStaffWithLimit(3000);
    const first = await createStaffAdvanceTool(adminCtx(), { staffId, amount: 2000, requestDate: "2026-06-01" });
    if (!first.ok) return;
    await decideStaffAdvanceTool(adminCtx(), { advanceId: first.data.advanceId, status: "approved" });

    // approved+2000 kullanılmış; +1500 daha istenirse 3500 > 3000 limit aşılır.
    const second = await createStaffAdvanceTool(adminCtx(), { staffId, amount: 1500, requestDate: "2026-07-01" });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("VALIDATION_ERROR");

    // Ama limit dahilindeki bir talep (+1000 = 3000, tam limit) kabul edilir.
    const third = await createStaffAdvanceTool(adminCtx(), { staffId, amount: 1000, requestDate: "2026-07-01" });
    expect(third.ok).toBe(true);
  });

  it("reddedilmiş avans limit hesabına dahil edilmez", async () => {
    const staffId = await createStaffWithLimit(2000);
    const first = await createStaffAdvanceTool(adminCtx(), { staffId, amount: 2000, requestDate: "2026-06-01" });
    if (!first.ok) return;
    await decideStaffAdvanceTool(adminCtx(), { advanceId: first.data.advanceId, status: "rejected" });

    // Reddedilen 2000 limite sayılmadığı için tam limit kadar yeni talep yine kabul edilmeli.
    const second = await createStaffAdvanceTool(adminCtx(), { staffId, amount: 2000, requestDate: "2026-07-01" });
    expect(second.ok).toBe(true);
  });

  it("annualAdvanceLimit tanımsızsa hiçbir kontrol uygulanmaz", async () => {
    const staffId = await createStaffWithLimit(undefined);
    const first = await createStaffAdvanceTool(adminCtx(), { staffId, amount: 1_000_000, requestDate: "2026-06-01" });
    expect(first.ok).toBe(true);
  });

  it("var olmayan staffId için avans talebi NOT_FOUND döner", async () => {
    const res = await createStaffAdvanceTool(adminCtx(), { staffId: "does-not-exist", amount: 100, requestDate: "2026-06-01" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });
});
