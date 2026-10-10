/**
 * 2026-09-22 kritik tur — CSV öğrencisinin ilk sözleşmesi, tek kanonik sözleşme
 * yolu, sözleşmesiz kayıt ve güvenli öğrenci silme regresyonları.
 *
 * Kök neden (CSV): import `derivedPerLessonAmount` yazmıyordu ve sözleşme motoru
 * bu alanı kapı olarak okuyordu → CSV öğrencisi sabit-taksit motoruna düşüyor,
 * önizlemede tür/dönem sütunları boş, sözleşmede "EĞİTİM" yazıyor, formda girilen
 * ilk tahsilat önizlemeye gitmiyor ve 1. taksite eşit olmak zorunda kalıyordu.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { readData } from "../store";
import {
  commitStudentImportTool,
  createStudentContractTool,
  createStudentTool,
  deleteStudentTool,
  getContractHtmlTool,
  getStudentDeletionImpactTool,
  previewContractInstallmentPlanTool,
  restoreDeletedStudentTool,
  setCriticalActionPasswordTool,
  updatePaymentTool,
} from "../services/tools";
import { buildContractPrefill, studentUsesPerLessonBilling } from "../contract-prefill";
import { contractReadinessPatch } from "../student-contract-readiness";
import { describeInstallmentForContract, STUDENT_CONTRACTS_FILE } from "../contracts";
import { DOCUMENT_INSTANCES_FILE, DOCUMENT_TEMPLATES_FILE } from "../documents";
import { CRITICAL_ACTION_PASSWORD_FILE } from "../critical-action-password";
import { resolveContractFilterKey } from "@/components/students-table";
import type { ServiceContext } from "../services/context";

const auditCalls: { action: string; outcome: string; meta?: Record<string, unknown> }[] = [];
vi.mock("../audit/log", () => ({
  recordAuditLog: vi.fn(async (input: { action: string; outcome: string; meta?: Record<string, unknown> }) => {
    auditCalls.push({ action: input.action, outcome: input.outcome, meta: input.meta });
    return { id: "audit", persisted: true };
  }),
}));

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function owner(over: Partial<ServiceContext> = {}): ServiceContext {
  return { role: "SUPER_ADMIN", userId: "user_owner_nilufer", tenantId: DEFAULT_TENANT_ID, channel: "web", ...over };
}

beforeEach(async () => {
  auditCalls.length = 0;
  for (const f of [DATA_FILE, STUDENT_CONTRACTS_FILE, DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE, CRITICAL_ACTION_PASSWORD_FILE]) {
    await fs.rm(f, { force: true });
  }
});

const START = "2026-10-01";

async function importCsvStudent(name = "Csv Öğrenci", kayitTarihi = START): Promise<string> {
  const t1 = (await readData()).teachers.find((t) => t.id === "t1")!;
  const csv =
    "ad_soyad,veli_ad_soyad,veli_telefon,ogrenci_telefon,sube,enstruman,ogretmen,paket,ders_suresi,haftalik_ders_sayisi,aylik_ucret,tc_kimlik_no,dogum_tarihi,dogum_yeri,okul_meslek,ev_adresi,sosyal_medya_izni,kayit_tarihi,notlar\n" +
    `${name},Veli ${name},0555 222 9999,0555 222 9998,Erzene,Piyano,${t1.name},Bireysel Aylık — 4 ders,40,1,3000,,2015-03-22,İzmir,Okul,Adres,,${kayitTarihi},\n`;
  const res = await commitStudentImportTool(owner(), { csvText: csv });
  expect(res.ok).toBe(true);
  return (await readData()).students.find((s) => s.name === name)!.id;
}

async function createNormalStudent(): Promise<string> {
  const res = await createStudentTool(owner(), {
    name: "Normal Öğrenci",
    parentName: "Veli",
    parentPhone: "5559998877",
    accountResponsibility: "PARENT_MANAGED",
    branchId: "erzene",
    instrument: "Piyano",
    teacherId: "t1",
    packageName: "Bireysel Aylık — 4 ders",
    weeklyLessonCount: 1,
    monthlyFee: 3000,
    firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: START },
    enrollmentStartDate: START,
    lessonDurationMinutes: 40,
    intendedDurationMonths: 3,
  });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("create failed");
  return res.data.studentId;
}

function planInput(studentId: string, extra: Record<string, unknown> = {}) {
  return {
    studentId,
    durationMonths: 3,
    monthlyAmount: 3000,
    installmentCount: 3,
    firstDueDate: START,
    paymentMethod: "cash",
    usePerLessonBilling: true,
    enrollmentStartDate: START,
    enrollmentEndDate: "2026-12-31",
    ...extra,
  };
}

function contractInput(studentId: string, extra: Record<string, unknown> = {}) {
  return {
    ...planInput(studentId),
    contractType: "initial" as const,
    programmeName: "Piyano",
    signatoryFullName: "Veli Kişi",
    signatoryRelationship: "veli",
    ...extra,
  };
}

describe("A — CSV öğrencisi normal kayıtla aynı sözleşmeye hazır alanları alır", () => {
  it("import ders-başı tutarı, öğrenci numarasını, muhatabı ve kaydı açanı yazar; ilk tahsilat UYDURMAZ", async () => {
    const id = await importCsvStudent();
    const data = await readData();
    const s = data.students.find((x) => x.id === id)!;
    expect(s.derivedPerLessonAmount).toBe(750);
    expect(s.displayId).toMatch(/^S\d+/);
    expect(s.accountResponsibility).toBe("PARENT_MANAGED");
    expect(s.createdByUserId).toBe("user_owner_nilufer");
    expect(data.payments.filter((p) => p.studentId === id)).toHaveLength(0);
    expect(buildContractPrefill({ student: s }).usePerLessonBilling).toBe(true);
  });

  it("eski (alanı boş) CSV öğrencisi de aynı motoru kullanır — kapı derivedPerLessonAmount değil", () => {
    expect(studentUsesPerLessonBilling({ weeklyLessonCount: 1, monthlyFee: 3000 })).toBe(true);
    expect(studentUsesPerLessonBilling({ weeklyLessonCount: 0, monthlyFee: 3000 })).toBe(false);
  });

  it("onarım kuralı yalnız boş alanları doldurur, dolu değeri ezmez", () => {
    expect(contractReadinessPatch({ id: "x", name: "x", monthlyFee: 3000, weeklyLessonCount: 1, parentPhone: "1" })).toEqual({
      derivedPerLessonAmount: 750,
      accountResponsibility: "PARENT_MANAGED",
      monthlyFeeManualOverride: false,
    });
    expect(
      contractReadinessPatch({
        id: "x",
        name: "x",
        monthlyFee: 3000,
        weeklyLessonCount: 1,
        derivedPerLessonAmount: 999,
        accountResponsibility: "SELF_MANAGED",
        monthlyFeeManualOverride: true,
      })
    ).toEqual({});
  });
});

describe("A — CSV öğrencisi ilk sözleşme: ilk tahsilat 1 → 7000, önizleme dolu", () => {
  it("önizleme formdaki ilk tahsilatı 1. satıra yazar ve tür/dönem sütunları doludur", async () => {
    const id = await importCsvStudent();
    const one = await previewContractInstallmentPlanTool(owner(), planInput(id, { firstPaymentAmount: 1 }));
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    expect(one.data.installments[0]!.amount).toBe(1);
    expect(one.data.installments.every((r) => r.kind && r.periodLabel)).toBe(true);

    const seven = await previewContractInstallmentPlanTool(owner(), planInput(id, { firstPaymentAmount: 7000 }));
    expect(seven.ok).toBe(true);
    if (!seven.ok) return;
    expect(seven.data.installments[0]!.amount).toBe(7000);
    expect(seven.data.installments[0]!.kind).toMatch(/first_collection/);
  });

  it("sözleşme oluşunca ilk tahsilat kayıt anı ödemesi olarak yazılır; sonradan 7000'e revize edilir", async () => {
    const id = await importCsvStudent();
    const created = await createStudentContractTool(
      owner(),
      contractInput(id, { firstPaymentCollected: { method: "cash", amount: 1, collectedAt: START } })
    );
    expect(created.ok, created.ok ? "" : created.error.message).toBe(true);
    if (!created.ok) return;

    let data = await readData();
    const reg = data.payments.filter((p) => p.studentId === id && p.source === "registration_first_payment");
    expect(reg).toHaveLength(1);
    expect(reg[0]!.contractId).toBe(created.data.contract.id);
    expect(reg[0]!.installmentSequence).toBe(1);
    expect(reg[0]!.amount).toBe(1);
    // Aynı tahsilat ikinci kez (contract kaynaklı) oluşturulmaz.
    expect(data.payments.filter((p) => p.studentId === id && p.installmentSequence === 1)).toHaveLength(1);

    const revised = await updatePaymentTool(owner(), { paymentId: reg[0]!.id, amount: 7000 });
    expect(revised.ok).toBe(true);
    data = await readData();
    const after = data.payments.find((p) => p.id === reg[0]!.id)!;
    expect(after.amount).toBe(7000);
    expect(after.paidAmount).toBe(7000);
    // Sözleşme ekranının ön doldurması da (yenileme sonrası) 7000'i okur.
    const prefill = buildContractPrefill({ student: data.students.find((s) => s.id === id)!, registrationFirstPayment: after });
    expect(prefill.firstCollectionAmount).toBe(7000);
  });

  it("kayıt tarihi olmayan CSV öğrencisi bozuk önizlemeye düşmez: başlangıç formda istenir, verilince plan dolar", async () => {
    const id = await importCsvStudent("Tarihsiz Öğrenci", "");
    const s = (await readData()).students.find((x) => x.id === id)!;
    expect(buildContractPrefill({ student: s }).enrollmentStartDate).toBeUndefined();
    const res = await previewContractInstallmentPlanTool(owner(), planInput(id, { firstPaymentAmount: 3000 }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.installments.every((r) => r.kind && r.periodLabel && r.amount > 0)).toBe(true);
  });
});

describe("B — tek sözleşme şablonu: CSV ve normal öğrenci aynı çıktıyı üretir", () => {
  it("iki öğrencinin sözleşme HTML'i aynı bölümleri ve aynı hizmet bedeli etiketlerini taşır", async () => {
    const csvId = await importCsvStudent();
    const normalId = await createNormalStudent();
    const csvC = await createStudentContractTool(
      owner(),
      contractInput(csvId, { firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: START } })
    );
    const normalC = await createStudentContractTool(owner(), contractInput(normalId));
    expect(csvC.ok && normalC.ok).toBe(true);
    if (!csvC.ok || !normalC.ok) return;
    const [a, b] = await Promise.all([
      getContractHtmlTool(owner(), { contractId: csvC.data.contract.id }),
      getContractHtmlTool(owner(), { contractId: normalC.data.contract.id }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    for (const html of [a.data.html, b.data.html]) {
      expect(html).toContain("HİZMET BEDELİ");
      expect(html).toContain("İlk tahsilat — ");
      expect(html).not.toContain("<td>EĞİTİM</td>");
    }
    const headings = (html: string) => html.match(/<h3>[^<]+<\/h3>/g) ?? [];
    expect(headings(a.data.html)).toEqual(headings(b.data.html));
    expect(csvC.data.installments.map((i) => i.kind)).toEqual(normalC.data.installments.map((i) => i.kind));
  });

  it("tür/dönem bilgisi olmayan satır bile boş/çıplak 'EĞİTİM' basmaz", () => {
    expect(describeInstallmentForContract({ dueDate: "2026-10-05T00:00:00.000Z" })).toBe("Eğitim ücreti — Ekim 2026");
    expect(describeInstallmentForContract(undefined)).toBe("");
  });
});

describe("D — sözleşmesiz öğrenci geçerli bir kayıttır", () => {
  it("sözleşmesiz yeni kayıt 'Sözleşme bekliyor' olarak listelenir, sonra aynı akışla sözleşme alır", async () => {
    const id = await createNormalStudent();
    const s = (await readData()).students.find((x) => x.id === id)!;
    const row = { id, name: s.name, instruments: s.instruments, packageName: s.packageName, monthlyFee: s.monthlyFee, active: true, studentTypes: [], paymentStatus: "paid" as const, intendedDurationMonths: s.intendedDurationMonths };
    expect(resolveContractFilterKey(row, "2026-09-22")).toBe("pending");
    const c = await createStudentContractTool(owner(), contractInput(id));
    expect(c.ok).toBe(true);
  });
});

describe("C — güvenli öğrenci silme", () => {
  const PW = "kritik-sifre-123";

  async function setPassword() {
    const res = await setCriticalActionPasswordTool(owner(), { newPassword: PW });
    expect(res.ok).toBe(true);
  }

  it("kurum yöneticisi (Ezgi/Nihal) etki özetini görür; öğretmen silemez ve göremez (2026-09-23 yetki genişletme)", async () => {
    const id = await createNormalStudent();
    const impact = await getStudentDeletionImpactTool(owner({ role: "SCHOOL_ADMIN" }), { studentId: id });
    expect(impact.ok).toBe(true);
    const del = await deleteStudentTool(owner({ role: "TEACHER" }), {
      studentId: id, mode: "soft", confirmationName: "Normal Öğrenci", criticalPassword: PW, reason: "deneme kaydı",
    });
    expect(del.ok).toBe(false);
    if (!del.ok) expect(del.error.code).toBe("FORBIDDEN");
    const teacherImpact = await getStudentDeletionImpactTool(owner({ role: "TEACHER" }), { studentId: id });
    expect(teacherImpact.ok).toBe(false);
  });

  it("kritik işlem şifresi belirlenmeden silme yapılamaz", async () => {
    const id = await createNormalStudent();
    const del = await deleteStudentTool(owner(), {
      studentId: id, mode: "soft", confirmationName: "Normal Öğrenci", criticalPassword: "x", reason: "deneme kaydı",
    });
    expect(del.ok).toBe(false);
    if (!del.ok) expect(del.error.message).toMatch(/Güvenlik/);
  });

  it("yanlış şifre ve yanlış ad reddedilir, denemeler audit'e 'denied' yazılır", async () => {
    await setPassword();
    const id = await createNormalStudent();
    const wrongPw = await deleteStudentTool(owner(), {
      studentId: id, mode: "soft", confirmationName: "Normal Öğrenci", criticalPassword: "yanlis-sifre", reason: "deneme kaydı",
    });
    expect(wrongPw.ok).toBe(false);
    const wrongName = await deleteStudentTool(owner(), {
      studentId: id, mode: "soft", confirmationName: "Başka Öğrenci", criticalPassword: PW, reason: "deneme kaydı",
    });
    expect(wrongName.ok).toBe(false);
    expect((await readData()).students.find((s) => s.id === id)?.deletedAt).toBeUndefined();
    expect(auditCalls.filter((c) => c.action === "student.delete_soft" && c.outcome === "denied")).toHaveLength(2);
  });

  it("geri alınabilir silme: öğrenci pasif + silindi, kayıtlar korunur, audit etkiyle yazılır, geri alınabilir", async () => {
    await setPassword();
    const id = await createNormalStudent();
    const paymentsBefore = (await readData()).payments.filter((p) => p.studentId === id).length;
    const del = await deleteStudentTool(owner(), {
      studentId: id, mode: "soft", confirmationName: "  normal öğrenci ", criticalPassword: PW, reason: "Yanlışlıkla iki kez açıldı",
    });
    expect(del.ok).toBe(true);
    let s = (await readData()).students.find((x) => x.id === id)!;
    expect(s.deletedAt).toBeDefined();
    expect(s.deletedByUserId).toBe("user_owner_nilufer");
    expect(s.active).toBe(false);
    expect((await readData()).payments.filter((p) => p.studentId === id)).toHaveLength(paymentsBefore);
    const ok = auditCalls.find((c) => c.action === "student.delete_soft" && c.outcome === "success");
    expect(ok?.meta).toMatchObject({ mode: "soft", paymentCount: paymentsBefore });

    const restored = await restoreDeletedStudentTool(owner(), { studentId: id });
    expect(restored.ok).toBe(true);
    s = (await readData()).students.find((x) => x.id === id)!;
    expect(s.deletedAt).toBeUndefined();
    expect(auditCalls.some((c) => c.action === "student.delete_restore")).toBe(true);
  });

  it("kalıcı silme ödemeli/sözleşmeli öğrencide engellenir; boş öğrencide yapılır", async () => {
    await setPassword();
    const withPayment = await createNormalStudent();
    const blocked = await deleteStudentTool(owner(), {
      studentId: withPayment, mode: "hard", confirmationName: "Normal Öğrenci", criticalPassword: PW, reason: "deneme kaydı",
    });
    expect(blocked.ok).toBe(false);
    expect((await readData()).students.some((s) => s.id === withPayment)).toBe(true);

    const empty = await importCsvStudent("Boş Deneme");
    const impact = await getStudentDeletionImpactTool(owner(), { studentId: empty });
    expect(impact.ok && impact.data.hardDeleteEligible).toBe(true);
    const hard = await deleteStudentTool(owner(), {
      studentId: empty, mode: "hard", confirmationName: "Boş Deneme", criticalPassword: PW, reason: "deneme kaydı",
    });
    expect(hard.ok).toBe(true);
    expect((await readData()).students.some((s) => s.id === empty)).toBe(false);
    expect(auditCalls.some((c) => c.action === "student.delete_hard" && c.outcome === "success")).toBe(true);
  });

  it("kritik işlem şifresi değiştirilirken mevcut şifre zorunludur", async () => {
    await setPassword();
    const noCurrent = await setCriticalActionPasswordTool(owner(), { newPassword: "yeni-sifre-456" });
    expect(noCurrent.ok).toBe(false);
    const withCurrent = await setCriticalActionPasswordTool(owner(), { newPassword: "yeni-sifre-456", currentPassword: PW });
    expect(withCurrent.ok).toBe(true);
    const raw = await fs.readFile(CRITICAL_ACTION_PASSWORD_FILE, "utf8");
    expect(raw).not.toContain("yeni-sifre-456");
  });
});
