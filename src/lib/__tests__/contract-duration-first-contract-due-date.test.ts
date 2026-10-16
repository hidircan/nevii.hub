/**
 * 2026-09-19 — Sözleşme Merkezi:
 *  I) kayıtta seçilen süre (10 ay) yönlendirme/düzenle/yeniden açma boyunca korunur
 *  H) kayıt bilgileri sözleşme ekranında düzenlenir (ekrandan atılmaz)
 *  K) sözleşmesi olmayan, kayıtta tahsilatı alınmamış öğrenci için ilk sözleşme
 *  L) ödeme önizlemesinde vade tarihi elle düzenlenir ve gerçek ödemelere yansır
 *  M) tarih çelişkileri açık Türkçe uyarı üretir (engel değil)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs, readFileSync } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createStudentContractTool,
  previewContractInstallmentPlanTool,
  updateStudentProfileTool,
} from "../services/tools";
import { applyInstallmentDueDateOverrides, buildInstallmentSchedule, STUDENT_CONTRACTS_FILE } from "../contracts";
import { buildContractPrefill, prefillFromContract } from "../contract-prefill";
import { contractDateGuidance } from "../contract-date-guidance";
import { DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE } from "../documents";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const read = (rel: string) => strip(readFileSync(path.resolve(import.meta.dirname, rel), "utf-8"));

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
  await fs.rm(DOCUMENT_TEMPLATES_FILE, { force: true });
  await fs.rm(DOCUMENT_INSTANCES_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

describe("I — kayıt süresi (10 ay) her akışta korunur", () => {
  it("kayıtta saklanan süre, URL'deki bayat/eksik değeri ezer", () => {
    const student = { monthlyFee: 4000, intendedDurationMonths: 10 };
    expect(buildContractPrefill({ student }).durationMonths).toBe(10); // öğrenci detayından giriş (sure yok)
    expect(buildContractPrefill({ student, requestedDurationMonths: "3" }).durationMonths).toBe(10); // eski düzenle-dön turu
    expect(buildContractPrefill({ student, requestedDurationMonths: "abc" }).durationMonths).toBe(10);
  });

  it("süre kaydı yoksa: URL → sözleşmenin kendi süresi → varsayılan 3", () => {
    expect(buildContractPrefill({ student: { monthlyFee: 1 }, requestedDurationMonths: "10" }).durationMonths).toBe(10);
    // Birleşik ilk tahsilatta taksit sayısı 9'dur; süre 10 — taksit sayısı süre sayılmaz.
    expect(
      buildContractPrefill({ student: { monthlyFee: 1 }, latestContract: { durationMonths: 10, installmentCount: 9 } }).durationMonths
    ).toBe(10);
    expect(buildContractPrefill({ student: { monthlyFee: 1 } }).durationMonths).toBe(3);
    const rebuilt = prefillFromContract({ durationMonths: 10, installmentCount: 9 }, buildContractPrefill({ student: { monthlyFee: 1 } }));
    expect(rebuilt.durationMonths).toBe(10);
  });

  it("süre öğrenci kaydına yazılır ve yeniden okununca (refresh/düzenle) aynı kalır", async () => {
    const res = await updateStudentProfileTool(admin, { studentId: "s1", intendedDurationMonths: 10 });
    expect(res.ok).toBe(true);
    const s1 = (await readData()).students.find((s) => s.id === "s1")!;
    expect(s1.intendedDurationMonths).toBe(10);
    expect(buildContractPrefill({ student: s1 }).durationMonths).toBe(10);
  });

  it("geçersiz süre Türkçe nedenle reddedilir", async () => {
    const res = await updateStudentProfileTool(admin, { studentId: "s1", intendedDurationMonths: 13 });
    expect(res.ok).toBe(false);
  });

  it("Sözleşme Merkezi düzenle linki süreyi URL'de taşımaz; sayfa süreyi kayıttan okur", () => {
    const page = read("../../app/panel/ogrenciler/[studentId]/sozlesmeler/page.tsx");
    expect(page).not.toMatch(/sozlesmeSure=\$\{/);
    // Çoklu branş v2: süre seçilen branşın kalıcı kaydından (`branchStudent`).
    expect(page).toMatch(/branchStudent\.intendedDurationMonths/);
    const detail = read("../../app/panel/ogrenciler/[studentId]/page.tsx");
    expect(detail).not.toMatch(/sure=\$\{encodeURIComponent\(sozlesmeSure\)\}/);
  });
});

describe("H — kayıt bilgisi sözleşme ekranında düzenlenir", () => {
  it("özet kartı öğrenci ekranına ATMAZ; süre + ders başlangıcını yerinde kaydeder ve forma uygular", () => {
    const panel = read("../../components/contract-panel.tsx");
    expect(panel).not.toMatch(/Kayıtta düzenle →/);
    expect(panel).toMatch(/Süre \/ ders başlangıcını burada düzenle/);
    expect(panel).toMatch(/actionUpdateStudentProfile\(\{\s*studentId,\s*intendedDurationMonths: regDuration,\s*lessonStartDate: regLessonStart/);
    expect(panel).toMatch(/onApplyToForm\(\{ durationMonths: regDuration, lessonStartDay: regLessonStart \}\)/);
    // Formdaki süre değişikliği de kayda yazılır.
    expect(panel).toMatch(/actionUpdateStudentProfile\(\{ studentId, intendedDurationMonths: next \}\)/);
  });
});

async function seedStudentWithoutRegistrationPayment() {
  const data = await readData();
  expect(data.payments.some((p) => p.studentId === "s1" && p.source === "registration_first_payment")).toBe(false);
}

const BASE_CONTRACT = {
  studentId: "s1",
  contractType: "initial" as const,
  programmeName: "Piyano",
  enrollmentStartDate: "2026-09-01T00:00:00.000Z",
  enrollmentEndDate: "2026-11-30T00:00:00.000Z",
  durationMonths: 3,
  monthlyAmount: 3000,
  installmentCount: 3,
  firstDueDate: "2026-09-01T00:00:00.000Z",
  signatoryFullName: "Selin Arslan",
  signatoryRelationship: "veli" as const,
};

describe("K — mevcut öğrenci, sözleşmesiz, kayıtta tahsilat yok → ilk sözleşme", () => {
  it("ilk tahsilat girilmezse açık Türkçe neden", async () => {
    await seedStudentWithoutRegistrationPayment();
    const res = await createStudentContractTool(admin, BASE_CONTRACT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/İlk tahsilat/);
  });

  it("sözleşme formunda girilen ilk tahsilatla oluşur; ödeme kaydı öğrenciye yazılır", async () => {
    await seedStudentWithoutRegistrationPayment();
    const first = buildInstallmentSchedule({ totalContractAmount: 9000, installmentCount: 3, firstDueDate: BASE_CONTRACT.firstDueDate })[0]!.amount;
    const res = await createStudentContractTool(admin, {
      ...BASE_CONTRACT,
      firstPaymentCollected: { method: "cash", amount: first, collectedAt: "2026-09-19T00:00:00.000Z" },
    });
    expect(res.ok).toBe(true);
    const payments = (await readData()).payments.filter((p) => p.studentId === "s1" && p.contractId);
    expect(payments.length).toBeGreaterThanOrEqual(3);
  });

  it("formda ilk tahsilat alanı, kayıtta tahsilat yoksa ilk sözleşmede de görünür", () => {
    const panel = read("../../components/contract-panel.tsx");
    expect(panel).toMatch(/const needsFirstPaymentEntryBase = isRenewal \|\| !registration\?\.firstPayment;/);
    expect(panel).toMatch(/\{needsFirstPaymentEntry \? \(\s*<fieldset/);
    expect(panel).toMatch(/firstPaymentCollected: needsFirstPaymentEntry/);
  });
});

describe("L — vade tarihi elle düzenlenir", () => {
  const rows = [
    { sequence: 1, dueDate: "2026-09-01T00:00:00.000Z", amount: 3000 },
    { sequence: 2, dueDate: "2026-10-15T00:00:00.000Z", amount: 3000 },
  ];

  it("override uygulanır, 'manual' işaretlenir; eşit/verilmeyen satır dokunulmaz", () => {
    const out = applyInstallmentDueDateOverrides(rows, [{ sequence: 2, dueDate: "2026-10-20" }]);
    expect(out[1]!.dueDate).toBe("2026-10-20T00:00:00.000Z");
    expect(out[1]!.dueDateSource).toBe("manual");
    expect(out[0]).toBe(rows[0]);
    expect(applyInstallmentDueDateOverrides(rows, [{ sequence: 2, dueDate: "2026-10-15" }])[1]).toBe(rows[1]);
  });

  it("geçersiz gün Türkçe hata verir", () => {
    expect(() => applyInstallmentDueDateOverrides(rows, [{ sequence: 2, dueDate: "2026-02-31" }])).toThrow(/vade tarihi geçersiz/);
  });

  it("önizleme ve oluşturulan gerçek ödeme satırı AYNI elle girilen vadeyi taşır", async () => {
    const preview = await previewContractInstallmentPlanTool(admin, {
      ...BASE_CONTRACT,
      firstDueDate: "2026-09-01",
      installmentDueDateOverrides: [{ sequence: 2, dueDate: "2026-10-20" }],
    });
    expect(preview.ok).toBe(true);
    if (preview.ok) expect(preview.data.installments[1]!.dueDate.slice(0, 10)).toBe("2026-10-20");

    const first = buildInstallmentSchedule({ totalContractAmount: 9000, installmentCount: 3, firstDueDate: BASE_CONTRACT.firstDueDate })[0]!.amount;
    const res = await createStudentContractTool(admin, {
      ...BASE_CONTRACT,
      firstPaymentCollected: { method: "cash", amount: first, collectedAt: "2026-09-01T00:00:00.000Z" },
      installmentDueDateOverrides: [{ sequence: 2, dueDate: "2026-10-20" }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const payments = (await readData()).payments.filter((p) => p.contractId === res.data.contract.id);
    expect(payments.some((p) => p.dueDate.slice(0, 10) === "2026-10-20")).toBe(true);
  });
});

describe("M — tarih çelişkileri net Türkçe uyarı (engel değil)", () => {
  it("her çelişki kendi cümlesiyle", () => {
    const notices = contractDateGuidance({
      registeredAt: "2026-09-10",
      lessonStartDay: "2026-09-01",
      contractStartDay: "2026-09-01",
      firstPaymentCollectedAt: "2026-08-25",
      firstDueDate: "2026-08-30",
      today: "2026-09-19",
      installments: [
        { sequence: 1, dueDate: "2026-09-01" },
        { sequence: 2, dueDate: "2026-10-15" },
        { sequence: 3, dueDate: "2026-10-01", manual: true },
      ],
    });
    const text = notices.map((n) => n.text).join("\n");
    expect(text).toMatch(/Ders başlangıcı \(01\.09\.2026\) kayıt tarihinden \(10\.09\.2026\) önce/);
    expect(text).toMatch(/Sözleşme başlangıcı \(01\.09\.2026\) geçmişte/);
    expect(text).toMatch(/İlk tahsilat tarihi \(25\.08\.2026\) sözleşme başlangıcından/);
    expect(text).toMatch(/İlk taksit vadesi \(30\.08\.2026\) sözleşme başlangıç tarihinden/);
    expect(text).toMatch(/3\. taksitin elle girilen vadesi \(01\.10\.2026\) bir önceki taksitten/);
  });

  it("tutarlı tarihlerde uyarı yok", () => {
    expect(
      contractDateGuidance({
        registeredAt: "2026-09-01",
        lessonStartDay: "2026-10-01",
        contractStartDay: "2026-10-01",
        firstPaymentCollectedAt: "2026-10-01",
        firstDueDate: "2026-10-01",
        today: "2026-09-19",
      })
    ).toEqual([]);
  });
});
