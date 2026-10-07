import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { TRIAL_LESSONS_FILE } from "../trial-lessons";
import { resolveActiveInstrumentNames } from "../instrument-catalog";
import { assertSchedulableDate } from "../lesson-scheduling";
import {
  CLUBS_FILE,
  CLUB_MEMBERSHIPS_FILE,
  addClubMemberTool,
  endClubMembershipTool,
  groupClubSessions,
  listClubMemberships,
  planClubFeeAccruals,
  rescheduleClubSessionTool,
  saveClubTool,
  scheduleClubSessionsTool,
  setClubApplicationsOpenTool,
  updateClubMembershipTool,
  type Club,
} from "../clubs";
import {
  CLUB_APPLICATIONS_FILE,
  commitAddToClubTool,
  diffOffers,
  getClubApplication,
  listClubApplicationsTool,
  listPublicClubs,
  previewAddToClubTool,
  queryClubApplications,
  submitPublicClubApplication,
  updateClubApplicationTool,
} from "../club-applications";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "../timezone";
import type { ServiceContext } from "../services/context";

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue({ id: "a", persisted: true }) }));
const notify = vi.fn().mockResolvedValue(["created"]);
vi.mock("../manager-notifications", () => ({ notifyAdmins: (...a: unknown[]) => notify(...a) }));

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const teacherCtx: ServiceContext = { role: "TEACHER", userId: "t1", tenantId: DEFAULT_TENANT_ID, channel: "web", teacherId: "t1" };
const tenant = { tenantId: DEFAULT_TENANT_ID };
const today = toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE);
const plusDays = (n: number) => toZonedYmd(new Date(Date.now() + n * 86_400_000), DEFAULT_APP_TIMEZONE);

beforeEach(async () => {
  notify.mockClear();
  for (const f of [DATA_FILE, STUDENT_CONTRACTS_FILE, CLUBS_FILE, CLUB_MEMBERSHIPS_FILE, TRIAL_LESSONS_FILE, CLUB_APPLICATIONS_FILE]) await fs.rm(f, { force: true });
});

async function ctx() {
  const { readData } = await import("../store");
  const data = await readData();
  const catalog = await resolveActiveInstrumentNames(DEFAULT_TENANT_ID);
  const teacher = data.teachers.find((t) => t.active && t.instruments.some((i) => catalog.includes(i)))!;
  const instrument = teacher.instruments.find((i) => catalog.includes(i))!;
  const branchId = data.settings.branches[0]!.id;
  const students = data.students.filter((s) => s.active && !s.deletedAt);
  return { data, teacher, instrument, branchId, students };
}

async function openClub(over: Partial<Club> & { name: string; instrument: string; branchId: string }): Promise<Club> {
  const res = await saveClubTool(admin, {
    maxMembers: 5,
    monthlyFee: 1500,
    durationMinutes: 40,
    teacherIds: [],
    audience: "child",
    startDate: today,
    endDate: plusDays(120),
    applicationsOpen: true,
    ...over,
  });
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}

const childForm = (clubId: string, over: Record<string, unknown> = {}) => ({
  clubId,
  participantName: "Ada Deneme",
  birthDate: "2016-05-01",
  parentName: "Veli Deneme",
  phone: "0532 111 22 33",
  kvkkConsent: true,
  elapsedMs: 10_000,
  ...over,
});

async function paymentsCount() {
  const { readData } = await import("../store");
  return (await readData()).payments.length;
}

describe("grup dersi başvuru portalı (2026-10-07)", () => {
  it("kulüp üyesiz ve öğretmensiz TASLAK olarak kaydedilir; başvuruya açmak eksikleri tek tek ister; yeni kulüp kapalı başlar", async () => {
    const { instrument, branchId } = await ctx();
    const draft = await saveClubTool(admin, { name: "Taslak", instrument, maxMembers: 8, monthlyFee: 0, durationMinutes: 40, teacherIds: [] });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.data.applicationsOpen).toBe(false);
    expect(draft.data.teacherIds).toEqual([]);
    const open = await setClubApplicationsOpenTool(admin, { clubId: draft.data.id, open: true });
    expect(!open.ok && open.error.message).toMatch(/grubu seçilmedi.*şube seçilmedi.*başlangıç tarihi/);
    // Tarih yanlış girildiyse rahatça düzeltilir.
    const fixed = await saveClubTool(admin, { ...draft.data, audience: "adult", branchId, startDate: today, endDate: plusDays(30) });
    expect(fixed.ok).toBe(true);
    const fixed2 = await saveClubTool(admin, { ...draft.data, audience: "adult", branchId, startDate: today, endDate: plusDays(60) });
    expect(fixed2.ok && fixed2.data.endDate).toBe(plusDays(60));
    expect((await setClubApplicationsOpenTool(admin, { clubId: draft.data.id, open: true })).ok).toBe(true);
    // Bitiş başlangıçtan önce olamaz.
    const bad = await saveClubTool(admin, { ...draft.data, startDate: plusDays(10), endDate: plusDays(5) });
    expect(!bad.ok && bad.error.message).toContain("Bitiş tarihi başlangıç");
  });

  it("halka açık liste yalnız açık + dönemi sürmekte kulüpleri döner; öğretmen, yönetim notu, kontenjan sayısı ve üye verisi SIZMAZ", async () => {
    const { instrument, branchId, teacher } = await ctx();
    const visible = await openClub({ name: "Keman — Çocuk", instrument, branchId, teacherIds: [teacher.id], internalNote: "GIZLI-NOT-123" });
    await saveClubTool(admin, { name: "Kapalı", instrument, maxMembers: 5, monthlyFee: 1, durationMinutes: 40 });
    const list = await listPublicClubs(DEFAULT_TENANT_ID);
    expect(list.map((c) => c.clubId)).toEqual([visible.id]);
    const raw = JSON.stringify(list);
    for (const leak of [teacher.id, teacher.name, "GIZLI-NOT-123", "teacherIds", "internalNote", "maxMembers", "createdByUserId"]) expect(raw).not.toContain(leak);
  });

  it("sunucu kapalı/bitmiş/dolu kulübe başvuru kabul etmez; doluysa bekleme listesi yalnız yönetici açtıysa", async () => {
    const { instrument, branchId, students } = await ctx();
    const closed = await saveClubTool(admin, { name: "Kapalı", instrument, maxMembers: 5, monthlyFee: 1, durationMinutes: 40 });
    expect(closed.ok).toBe(true);
    const r1 = await submitPublicClubApplication(tenant, childForm(closed.ok ? closed.data.id : ""));
    expect(r1.ok).toBe(false);
    const full = await openClub({ name: "Dolu", instrument, branchId, maxMembers: 1 });
    expect((await addClubMemberTool(admin, { clubId: full.id, studentId: students[0]!.id })).ok).toBe(true);
    const r2 = await submitPublicClubApplication(tenant, childForm(full.id));
    expect(!r2.ok && r2.message).toContain("kontenjanı dolu");
    expect((await saveClubTool(admin, { ...full, waitlistEnabled: true })).ok).toBe(true);
    const r3 = await submitPublicClubApplication(tenant, childForm(full.id));
    expect(r3.ok && r3.waitlist).toBe(true);
    const page = await queryClubApplications(DEFAULT_TENANT_ID, {});
    expect(page.items[0]).toMatchObject({ status: "waitlisted", waitlistRequested: true });
    // Dönemi bitmiş kulüp (bitiş dün) — açık işaretli olsa da listelenmez ve başvuru almaz.
    const { CLUBS_FILE: file } = await import("../clubs");
    const rows = JSON.parse(await fs.readFile(file, "utf8")) as Array<Record<string, unknown>>;
    for (const r of rows) if (r.id === full.id) Object.assign(r, { startDate: plusDays(-60), endDate: plusDays(-1) });
    await fs.writeFile(file, JSON.stringify(rows));
    expect((await listPublicClubs(DEFAULT_TENANT_ID)).some((c) => c.clubId === full.id)).toBe(false);
    const r4 = await submitPublicClubApplication(tenant, childForm(full.id));
    expect(!r4.ok && r4.message).toContain("dönemi sona erdi");
  });

  it("başvuru: çocukta veli+doğum tarihi zorunlu; aynı telefon farklı çocuklar için engellenmez; tekrar deneme tek kayıt; ücret/üyelik/borç yazılmaz; bildirim tek", async () => {
    const { instrument, branchId } = await ctx();
    const club = await openClub({ name: "Gitar — Çocuk", instrument, branchId, monthlyFee: 2000, minAge: 6, maxAge: 12 });
    const before = await paymentsCount();
    const noParent = await submitPublicClubApplication(tenant, childForm(club.id, { parentName: "" }));
    expect(!noParent.ok && noParent.field).toBe("parentName");
    const tooOld = await submitPublicClubApplication(tenant, childForm(club.id, { birthDate: "2005-01-01" }));
    expect(!tooOld.ok && tooOld.message).toContain("en fazla 12 yaş");
    const a = await submitPublicClubApplication(tenant, childForm(club.id, { submissionKey: "form-key-0001" }));
    const again = await submitPublicClubApplication(tenant, childForm(club.id, { submissionKey: "form-key-0001" }));
    expect(a.ok && again.ok && a.reference === again.reference && /^KB-[A-Z2-9]{6}$/.test(a.reference ?? "")).toBe(true);
    const sibling = await submitPublicClubApplication(tenant, childForm(club.id, { participantName: "Can Deneme", birthDate: "2018-02-02", submissionKey: "form-key-0002" }));
    expect(sibling.ok).toBe(true);
    // Bot hızında gönderim sessizce yok sayılır (kayıt yok).
    expect(await submitPublicClubApplication(tenant, childForm(club.id, { elapsedMs: 300 }))).toEqual({ ok: true });
    const page = await queryClubApplications(DEFAULT_TENANT_ID, {});
    expect(page.total).toBe(2);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(String(notify.mock.calls[0]![2].body)).toContain("Detay: /panel/kulupler/basvurular/");
    // Bildirimde adayın yazdığı serbest metin yok.
    expect(String(notify.mock.calls[0]![2].body)).not.toContain("Ada Deneme");
    expect(await paymentsCount()).toBe(before);
    expect(await listClubMemberships(DEFAULT_TENANT_ID)).toHaveLength(0);
    // Arama: telefon ve ad.
    expect((await queryClubApplications(DEFAULT_TENANT_ID, { q: "5321112233" })).total).toBe(2);
    expect((await queryClubApplications(DEFAULT_TENANT_ID, { q: "can" })).total).toBe(1);
  });

  it("yetki: öğretmen başvuruları göremez/yönetemez/kulübe ekleyemez; 'Kulübe eklendi' elle verilemez", async () => {
    const { instrument, branchId, students } = await ctx();
    const club = await openClub({ name: "Şan — Çocuk", instrument, branchId });
    const s = await submitPublicClubApplication(tenant, childForm(club.id, { submissionKey: "form-key-0003" }));
    const app = (await queryClubApplications(DEFAULT_TENANT_ID, {})).items[0]!;
    expect(s.ok).toBe(true);
    expect((await listClubApplicationsTool(teacherCtx, {})).ok).toBe(false);
    expect((await updateClubApplicationTool(teacherCtx, { id: app.id, status: "contacted" })).ok).toBe(false);
    expect((await commitAddToClubTool(teacherCtx, { applicationId: app.id, studentId: students[0]!.id })).ok).toBe(false);
    const manual = await updateClubApplicationTool(admin, { id: app.id, status: "added" });
    expect(!manual.ok && manual.error.message).toContain("Kulübe ekle");
    expect((await updateClubApplicationTool(admin, { id: app.id, status: "contacted", staffNote: "arandı" })).ok).toBe(true);
    expect((await getClubApplication(DEFAULT_TENANT_ID, app.id))?.status).toBe("contacted");
  });

  it("kulübe ekle: önizleme yazmaz; onay ücret satırı yazmadan üyelik açar; çift tıklama/eşzamanlı istek tek üyelik; kapasite sunucuda", async () => {
    const { instrument, branchId, students } = await ctx();
    const club = await openClub({ name: "Keman — Yetişkin", instrument, branchId, audience: "adult", maxMembers: 1 });
    await submitPublicClubApplication(tenant, { ...childForm(club.id), birthDate: undefined, parentName: undefined, age: 30, submissionKey: "form-key-0004" });
    await submitPublicClubApplication(tenant, { ...childForm(club.id), birthDate: undefined, parentName: undefined, age: 40, participantName: "Diğer Kişi", submissionKey: "form-key-0005" });
    const [second, first] = (await queryClubApplications(DEFAULT_TENANT_ID, {})).items;
    const before = await paymentsCount();
    const pv = await previewAddToClubTool(admin, { applicationId: first!.id, studentId: students[0]!.id });
    expect(pv.ok && pv.data.blockers).toEqual([]);
    expect(await listClubMemberships(DEFAULT_TENANT_ID)).toHaveLength(0);
    const [x, y] = await Promise.all([
      commitAddToClubTool(admin, { applicationId: first!.id, studentId: students[0]!.id }),
      commitAddToClubTool(admin, { applicationId: first!.id, studentId: students[0]!.id }),
    ]);
    expect(x.ok && y.ok).toBe(true);
    const ms = await listClubMemberships(DEFAULT_TENANT_ID);
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ clubId: club.id, studentId: students[0]!.id, applicationId: first!.id, monthlyFee: 1500 });
    expect(await paymentsCount()).toBe(before);
    expect((await getClubApplication(DEFAULT_TENANT_ID, first!.id))).toMatchObject({ status: "added", membershipId: ms[0]!.id, studentId: students[0]!.id });
    // Aylık tahakkuk başlangıç ayını yazmaz (yönetici "Başlangıç ücretini yaz" ile ayrıca yazar), sonraki ayı yazar.
    // Kapasite dolu: ikinci başvuru eklenemez.
    const full = await commitAddToClubTool(admin, { applicationId: second!.id, studentId: students[1]!.id });
    expect(!full.ok && full.error.message).toContain("kontenjanı dolu");
  });

  it("dahil solfej: ek ücretsiz tek üyelik; iki ana kulüpten hak — biri bitince solfej kalır, ikisi bitince biter; bağımsız ücretli solfej korunur; dolu solfej yalnız açık onayla", async () => {
    const { instrument, branchId, students } = await ctx();
    const { createInstrumentCatalogTool } = await import("../services/tools");
    const cat = await createInstrumentCatalogTool(admin, { name: "Solfej" });
    expect(cat.ok || (!cat.ok && cat.error.message.includes("zaten"))).toBe(true);
    const solfege = await openClub({ name: "Solfej — Çocuk", instrument: "Solfej", branchId, monthlyFee: 900, maxMembers: 3 });
    const keman = await openClub({ name: "Keman — Çocuk", instrument, branchId, includedSolfegeClubId: solfege.id });
    const gitar = await openClub({ name: "Gitar — Çocuk", instrument, branchId, includedSolfegeClubId: solfege.id });
    // Uygunsuz bağ (yetişkin solfej → çocuk kulübü) reddedilir.
    const adultSolfege = await openClub({ name: "Solfej — Yetişkin", instrument: "Solfej", branchId, audience: "adult" });
    const badLink = await saveClubTool(admin, { ...keman, includedSolfegeClubId: adultSolfege.id });
    expect(!badLink.ok && badLink.error.message).toContain("yaş grubu");
    // Portal: "dahil" bilgisi solfejin halka açık programıyla gelir.
    expect((await listPublicClubs(DEFAULT_TENANT_ID)).find((c) => c.clubId === keman.id)?.includedSolfege?.name).toBe("Solfej — Çocuk");

    const s0 = students[0]!;
    await submitPublicClubApplication(tenant, childForm(keman.id, { submissionKey: "form-key-0101" }));
    await submitPublicClubApplication(tenant, childForm(gitar.id, { submissionKey: "form-key-0102" }));
    const [appG, appK] = (await queryClubApplications(DEFAULT_TENANT_ID, {})).items;
    const before = await paymentsCount();
    expect((await commitAddToClubTool(admin, { applicationId: appK!.id, studentId: s0.id })).ok).toBe(true);
    expect((await commitAddToClubTool(admin, { applicationId: appG!.id, studentId: s0.id })).ok).toBe(true);
    let ms = await listClubMemberships(DEFAULT_TENANT_ID);
    const sol = ms.filter((m) => m.clubId === solfege.id);
    expect(sol).toHaveLength(1);
    expect(sol[0]!.monthlyFee).toBe(0);
    expect(sol[0]!.includedByMembershipIds).toHaveLength(2);
    expect(await paymentsCount()).toBe(before);
    // Dahil solfej ücretsiz → aylık tahakkuk planına hiç girmez.
    const { listClubs } = await import("../clubs");
    const plan = planClubFeeAccruals({ clubs: await listClubs(DEFAULT_TENANT_ID), memberships: ms, students, payments: [], month: "2099-01" });
    expect(plan.some((m) => m.clubId === solfege.id)).toBe(false);

    const kemanM = ms.find((m) => m.clubId === keman.id)!;
    const gitarM = ms.find((m) => m.clubId === gitar.id)!;
    const e1 = await endClubMembershipTool(admin, { membershipId: kemanM.id });
    expect(e1.ok && e1.data.endedIncluded).toEqual([]);
    ms = await listClubMemberships(DEFAULT_TENANT_ID);
    expect(ms.find((m) => m.id === sol[0]!.id)?.endDate).toBeUndefined();
    const e2 = await endClubMembershipTool(admin, { membershipId: gitarM.id });
    expect(e2.ok && e2.data.endedIncluded).toEqual(["Solfej — Çocuk"]);

    // Bağımsız (ücretli) solfej üyesi: ana üyelik bitince solfeje dokunulmaz.
    const s1 = students[1]!;
    const own = await addClubMemberTool(admin, { clubId: solfege.id, studentId: s1.id });
    expect(own.ok && own.data.membership.monthlyFee).toBe(900);
    await submitPublicClubApplication(tenant, childForm(keman.id, { participantName: "Bağımsız Solfejci", submissionKey: "form-key-0103" }));
    const appB = (await queryClubApplications(DEFAULT_TENANT_ID, { q: "Bağımsız" })).items[0]!;
    const pv = await previewAddToClubTool(admin, { applicationId: appB.id, studentId: s1.id });
    expect(pv.ok && pv.data.solfege).toMatchObject({ action: "grant", existingIndependent: true });
    expect((await commitAddToClubTool(admin, { applicationId: appB.id, studentId: s1.id })).ok).toBe(true);
    const kemanB = (await listClubMemberships(DEFAULT_TENANT_ID)).find((m) => m.clubId === keman.id && m.studentId === s1.id)!;
    const e3 = await endClubMembershipTool(admin, { membershipId: kemanB.id });
    expect(e3.ok && e3.data.endedIncluded).toEqual([]);
    expect((await listClubMemberships(DEFAULT_TENANT_ID)).filter((m) => m.clubId === solfege.id && m.studentId === s1.id && !m.endDate)).toHaveLength(1);

    // Solfej dolu (3/3): ana üyelik ancak açık onayla, solfej "bekliyor" olarak.
    await addClubMemberTool(admin, { clubId: solfege.id, studentId: students[2]!.id });
    await addClubMemberTool(admin, { clubId: solfege.id, studentId: students[3]!.id });
    await submitPublicClubApplication(tenant, childForm(keman.id, { participantName: "Dolu Solfej", submissionKey: "form-key-0104" }));
    const appF = (await queryClubApplications(DEFAULT_TENANT_ID, { q: "Dolu Solfej" })).items[0]!;
    const s4 = students[4]!;
    const blocked = await commitAddToClubTool(admin, { applicationId: appF.id, studentId: s4.id });
    expect(!blocked.ok && blocked.error.message).toContain("dahil solfej");
    expect((await listClubMemberships(DEFAULT_TENANT_ID)).some((m) => m.studentId === s4.id)).toBe(false);
    const okF = await commitAddToClubTool(admin, { applicationId: appF.id, studentId: s4.id, confirmSolfegeWaitlist: true });
    expect(okF.ok && okF.data.solfegePending).toBe(true);
    expect((await getClubApplication(DEFAULT_TENANT_ID, appF.id))?.solfegePending).toBe(true);
  });

  it("başvuru anındaki teklif saklanır; kulüp ücreti değişince fark görünür", async () => {
    const { instrument, branchId } = await ctx();
    const club = await openClub({ name: "Fark", instrument, branchId, monthlyFee: 1000 });
    await submitPublicClubApplication(tenant, childForm(club.id, { submissionKey: "form-key-0201" }));
    await saveClubTool(admin, { ...club, monthlyFee: 1250 });
    const app = (await queryClubApplications(DEFAULT_TENANT_ID, {})).items[0]!;
    expect(app.clubSnapshot.fee).toBe(1000);
    const now = (await listPublicClubs(DEFAULT_TENANT_ID)).find((c) => c.clubId === club.id)!;
    expect(diffOffers(app.clubSnapshot, now)).toEqual([{ field: "Ücret (TL)", then: "1000", now: "1250" }]);
  });

  it("tarih düzeltme: üyelik başlangıcı ay içinde düzeltilir, ücret satırlı ay değişimi reddedilir; sonlandırma geri alınır; yoklamasız oturum Telafi açmadan taşınır", async () => {
    const { data, teacher, instrument, students } = await ctx();
    const room = data.rooms.find((r) => r.active !== false && !r.deletedAt && r.branchId === teacher.branchId)!;
    const club = await saveClubTool(admin, { name: "Düzelt", instrument, branchId: room.branchId, maxMembers: 5, monthlyFee: 1500, durationMinutes: 40, teacherIds: [teacher.id] });
    if (!club.ok) throw new Error(club.error.message);
    const add = await addClubMemberTool(admin, { clubId: club.data.id, studentId: students[0]!.id });
    if (!add.ok) throw new Error(add.error.message);
    const m = add.data.membership;
    const otherMonth = `${Number(m.startDate.slice(0, 4)) + 1}${m.startDate.slice(4, 7)}-01`;
    const moveMonth = await updateClubMembershipTool(admin, { membershipId: m.id, startDate: otherMonth });
    expect(!moveMonth.ok && moveMonth.error.message).toContain("ücret satırı var");
    const sameMonthDay = `${m.startDate.slice(0, 7)}-01`;
    expect((await updateClubMembershipTool(admin, { membershipId: m.id, startDate: sameMonthDay })).ok).toBe(true);
    expect((await endClubMembershipTool(admin, { membershipId: m.id })).ok).toBe(true);
    const reopened = await updateClubMembershipTool(admin, { membershipId: m.id, endDate: "" });
    expect(reopened.ok && reopened.data.endDate).toBeUndefined();

    let startLocal = "";
    for (let d = 10; d < 40 && !startLocal; d++) {
      const ymd = new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
      if (assertSchedulableDate(`${ymd}T09:00:00.000Z`, data).ok) startLocal = `${ymd}T07:05`;
    }
    const sch = await scheduleClubSessionsTool(admin, { clubId: club.data.id, teacherId: teacher.id, roomId: room.id, startLocal, weeks: 2 });
    if (!sch.ok) throw new Error(sch.error.message);
    const { readData } = await import("../store");
    const before = groupClubSessions((await readData()).lessons, club.data.id);
    const target = `${startLocal.slice(0, 10)}T07:35`;
    const moved = await rescheduleClubSessionTool(admin, { sessionId: before[0]!.sessionId, startLocal: target, applyToFollowing: true });
    if (!moved.ok) throw new Error(moved.error.message);
    expect(moved.data.moved).toBe(2);
    const after = groupClubSessions((await readData()).lessons, club.data.id);
    expect(after).toHaveLength(2);
    expect(after.every((s) => !s.postponed && s.rows.every((r) => !r.opsMakeupFlag))).toBe(true);
    expect(Date.parse(after[0]!.startAt) - Date.parse(before[0]!.startAt)).toBe(30 * 60_000);
    expect(Date.parse(after[1]!.startAt) - Date.parse(before[1]!.startAt)).toBe(30 * 60_000);
  });
});
