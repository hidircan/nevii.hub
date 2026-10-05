import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { createStudentContractTool, createStudentTool } from "../services/tools";
import { resolveActiveInstrumentNames } from "../instrument-catalog";
import { summarizeStudentDebt } from "../payment-profile";
import {
  CLUBS_FILE,
  CLUB_MEMBERSHIPS_FILE,
  addClubMemberTool,
  applyClubRegistration,
  endClubMembershipTool,
  findClubFeeRow,
  listClubMemberships,
  listClubs,
  planClubFeeAccruals,
  runClubFeeAccrual,
  saveClubTool,
} from "../clubs";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "../timezone";
import type { ServiceContext } from "../services/context";

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const month = toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE).slice(0, 7);
const nextMonth = (() => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
})();

beforeEach(async () => {
  for (const f of [DATA_FILE, STUDENT_CONTRACTS_FILE, CLUBS_FILE, CLUB_MEMBERSHIPS_FILE]) await fs.rm(f, { force: true });
});

async function makeClub(maxMembers = 2) {
  const { readData } = await import("../store");
  const data = await readData();
  const catalog = await resolveActiveInstrumentNames(DEFAULT_TENANT_ID);
  const teacher = data.teachers.find((t) => t.active && t.instruments.some((i) => catalog.includes(i)))!;
  const instrument = teacher.instruments.find((i) => catalog.includes(i))!;
  const other = data.teachers.find((t) => t.active && !t.instruments.includes(instrument));
  // Seçilen öğretmenlerden hiçbiri branşta değilse reddedilir (sadece kulüp kaydı bu öğretmene bağlanır).
  if (other) {
    const bad = await saveClubTool(admin, { name: "Hatalı", instrument, maxMembers, monthlyFee: 1500, durationMinutes: 40, teacherIds: [other.id] });
    expect(!bad.ok && bad.error.message).toContain("branşında kayıtlı");
  }
  const res = await saveClubTool(admin, { name: "Solfej Kulübü", instrument, maxMembers, monthlyFee: 1500, durationMinutes: 40, teacherIds: [teacher.id] });
  expect(res.ok).toBe(true);
  const students = data.students.filter((s) => s.active && !s.deletedAt);
  return { club: res.ok ? res.data : undefined!, students, teacher, instrument };
}

describe("kulüp sistemi — 1. aşama (2026-10-05)", () => {
  it("üye eklenince bu ayın ücreti ayrı 'club' satırı; mükerrer üye ve kontenjan aşımı reddedilir; ücret sonradan değişse de üyelik dondurur", async () => {
    const { club, students } = await makeClub(2);
    const a = await addClubMemberTool(admin, { clubId: club.id, studentId: students[0]!.id });
    expect(a.ok).toBe(true);
    const { readData } = await import("../store");
    const row = (await readData()).payments.find((p) => a.ok && p.id === a.data.paymentId)!;
    expect(row).toMatchObject({ source: "club", amount: 1500, paidAmount: 0, clubMembershipId: a.ok ? a.data.membership.id : "" });
    expect(row.contractId).toBeUndefined();
    expect((await addClubMemberTool(admin, { clubId: club.id, studentId: students[0]!.id })).ok).toBe(false);
    expect((await addClubMemberTool(admin, { clubId: club.id, studentId: students[1]!.id })).ok).toBe(true);
    const full = await addClubMemberTool(admin, { clubId: club.id, studentId: students[2]!.id });
    expect(!full.ok && full.error.message).toContain("kontenjanı dolu");
    // Kontenjan aktif üyenin altına indirilemez.
    const shrink = await saveClubTool(admin, { ...club, maxMembers: 1 });
    expect(shrink.ok).toBe(false);
    // Ücret artışı mevcut üyeliği değiştirmez.
    expect((await saveClubTool(admin, { ...club, monthlyFee: 2000 })).ok).toBe(true);
    expect((await listClubMemberships(DEFAULT_TENANT_ID)).every((m) => m.monthlyFee === 1500)).toBe(true);
    expect((await listClubs(DEFAULT_TENANT_ID))[0]!.monthlyFee).toBe(2000);
  });

  it("aylık tahakkuk: sonraki ay bir kez yazılır (mükerrer yok); ayrılan üyeye bitiş ayından sonra yazılmaz", async () => {
    const { club, students } = await makeClub(5);
    const a = await addClubMemberTool(admin, { clubId: club.id, studentId: students[0]!.id });
    const b = await addClubMemberTool(admin, { clubId: club.id, studentId: students[1]!.id });
    expect(a.ok && b.ok).toBe(true);
    // Başlangıç ayı katılınca yazıldı — tahakkuk bu ayı tekrar yazmaz.
    expect((await runClubFeeAccrual(DEFAULT_TENANT_ID, { apply: true, month })).created).toBe(0);
    const ended = await endClubMembershipTool(admin, { membershipId: b.ok ? b.data.membership.id : "" });
    expect(ended.ok).toBe(true);
    const first = await runClubFeeAccrual(DEFAULT_TENANT_ID, { apply: true, month: nextMonth });
    expect(first).toEqual({ planned: 1, created: 1 });
    expect(await runClubFeeAccrual(DEFAULT_TENANT_ID, { apply: true, month: nextMonth })).toEqual({ planned: 0, created: 0 });
    const { readData } = await import("../store");
    const payments = (await readData()).payments;
    expect(findClubFeeRow(payments, a.ok ? a.data.membership.id : "", nextMonth)).toBeDefined();
    expect(findClubFeeRow(payments, b.ok ? b.data.membership.id : "", nextMonth)).toBeUndefined();
    // Saf plan da aynı sonucu verir.
    expect(planClubFeeAccruals({ clubs: [club], memberships: await listClubMemberships(DEFAULT_TENANT_ID), students, payments, month: nextMonth })).toEqual([]);
  });

  it("kulüp ücreti sözleşmeye taşınamaz; sadece kulüp kaydı kurs borcu/sözleşme olmadan oluşur, kulüp ücreti ayrı tahsil edilir", async () => {
    const { club, teacher, instrument } = await makeClub(5);
    const created = await createStudentTool(admin, {
      name: "Kulüp Öğrencisi",
      email: "",
      phone: "05320000000",
      parentName: "Veli",
      parentPhone: "05320000001",
      branchId: teacher.branchId,
      instrument,
      teacherId: teacher.id,
      packageName: `Kulüp — ${club.name}`,
      weeklyLessonCount: 1,
      monthlyFee: 0,
      notes: "",
      firstCollectionIncludesNextMonth: false,
      firstPaymentCollected: { amount: 0 },
      enrollmentStartDate: `${month}-02`,
      createPortalAccess: false,
    });
    if (!created.ok) throw new Error(JSON.stringify(created.error));
    const studentId = created.ok ? created.data.studentId : "";
    const warnings = await applyClubRegistration(admin, studentId, {
      clubs: [{ club, amount: 1000 }],
      method: "cash",
      collectedAt: `${month}-02`,
    });
    expect(warnings).toEqual([]);
    const { readData } = await import("../store");
    const mine = (await readData()).payments.filter((p) => p.studentId === studentId);
    // Kurs satırı yok (0 TL kayıt = tahsilat yok); yalnız kulüp satırı: 1500 borç, 1000 tahsil → 500 açık.
    expect(mine.map((p) => p.source)).toEqual(["club"]);
    expect(mine[0]).toMatchObject({ amount: 1500, paidAmount: 1000, method: "cash" });
    expect(summarizeStudentDebt(mine, new Set()).openTotal).toBe(500);
    const res = await createStudentContractTool(admin, {
      studentId,
      contractType: "initial",
      programmeName: instrument,
      enrollmentStartDate: `${month}-01T00:00:00.000Z`,
      enrollmentEndDate: `${nextMonth}-28T00:00:00.000Z`,
      durationMonths: 3,
      monthlyAmount: 3000,
      installmentCount: 3,
      firstDueDate: `${month}-01T00:00:00.000Z`,
      signatoryFullName: "Veli",
      signatoryRelationship: "veli",
      carryOverPaymentIds: [mine[0]!.id],
    });
    expect(!res.ok && res.error.message).toContain("taşınamaz");
  });
});
