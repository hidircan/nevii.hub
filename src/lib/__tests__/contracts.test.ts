import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createStudentContractTool,
  listStudentContractsTool,
  getStudentContractTool,
  printStudentContractTool,
  uploadStudentContractSignedScanTool,
  getContractHtmlTool,
  previewContractInstallmentPlanTool,
  cancelStudentContractTool,
  createDocumentTemplateTool,
  listAllDocumentTemplatesTool,
  getContractTemplateDiagnosticsTool,
  createContractTemplateDraftFromCanonicalSourceTool,
  activateContractTemplateTool,
  createPaymentTool,
  getRenewalDebtStatusTool,
  getSocialMediaConsentTool,
} from "../services/tools";
import {
  buildInstallmentSchedule,
  isFormalContractDuration,
  STUDENT_CONTRACTS_FILE,
  resolveContractPaymentDueRule,
  contractTitleFields,
  formatCheckboxOptionsText,
  createContract,
  computeContractEndDate,
} from "../contracts";
import { DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE } from "../documents";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { grantStudentAccess } from "./portal-access-test-helper";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}
function teacherCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "TEACHER", userId: "u3", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web", ...overrides };
}
function studentCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "STUDENT", userId: "u2", tenantId: DEFAULT_TENANT_ID, studentId: "s1", channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
  await fs.rm(DOCUMENT_TEMPLATES_FILE, { force: true });
  await fs.rm(DOCUMENT_INSTANCES_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

/**
 * P0 dedup fix (2026-08-30) — `createContract` "initial" için artık `firstPaymentCollected`
 * input'unu KULLANMAZ; kayıt (createStudentTool) sırasında zaten oluşturulmuş
 * `registration_first_payment` Payment satırını store'dan BULUP yeniden kullanır. Testlerde bu
 * satırı doğrudan store-json üzerinden seed eder (createStudentTool'un tamamını çağırmadan).
 */
async function seedRegistrationFirstPayment(studentId: string, amount: number, collectedAt: string) {
  const { addRegistrationFirstPayment } = await import("../store-json");
  await addRegistrationFirstPayment({ studentId, method: "cash", amount, collectedAt, receivedByUserId: "u1" });
}

/** Varsayılan: 3 ay = FORMAL sözleşme eşiğinde (isFormalContractDuration). Trial (1-2 ay) davranışı ayrı describe bloğunda test edilir. */
function buildInitialInput(overrides?: Partial<Record<string, unknown>>) {
  const durationMonths = (overrides?.durationMonths as number) ?? 3;
  const monthlyAmount = (overrides?.monthlyAmount as number) ?? 3000;
  const installmentCount = (overrides?.installmentCount as number) ?? 3;
  const firstDueDate = (overrides?.firstDueDate as string) ?? "2026-09-01T00:00:00.000Z";
  const enrollmentStartDate = (overrides?.enrollmentStartDate as string) ?? "2026-09-01T00:00:00.000Z";
  // Owner policy — İlk ödeme her zaman kayıt esnasında alınacaktır (FORMAL >=3 ay sözleşmelerde
  // zorunlu, bkz. contracts.ts createContract). Test yardımcı fonksiyonu 1. taksit tutarını
  // GERÇEK zamanlama fonksiyonuyla (buildInstallmentSchedule) hesaplar — sabit bir sayı
  // vermek, overrides ile monthlyAmount/installmentCount değiştiren testlerde tutar
  // uyuşmazlığı hatasına (createContract'ın kendi doğrulaması) yol açardı.
  let firstInstallmentAmount = monthlyAmount;
  try {
    firstInstallmentAmount =
      buildInstallmentSchedule({
        totalContractAmount: durationMonths * monthlyAmount,
        installmentCount,
        firstDueDate,
      })[0]?.amount ?? monthlyAmount;
  } catch {
    // Kasıtlı geçersiz girdi (ör. installmentCount=0, bozuk firstDueDate) test eden senaryolar —
    // asıl doğrulama zaten createContract'ın kendisinde; burada sadece makul bir varsayılana düş.
  }
  return {
    studentId: "s1",
    contractType: "initial" as const,
    programmeName: "Piyano",
    enrollmentStartDate,
    enrollmentEndDate: "2026-12-01T00:00:00.000Z",
    durationMonths,
    monthlyAmount,
    installmentCount,
    firstDueDate,
    signatoryFullName: "Selin Arslan",
    signatoryRelationship: "veli",
    firstPaymentCollected: { method: "cash", amount: firstInstallmentAmount, collectedAt: enrollmentStartDate },
    ...overrides,
  };
}

/**
 * `buildInitialInput` + kayıt anı ödemesini (`registration_first_payment`) seed eder — "initial"
 * sözleşme testlerinin çoğu bunu bekler (P0 fix sonrası `createContract` bu satırı BULUP
 * yeniden kullanır, `firstPaymentCollected` input'unu initial için artık kullanmaz).
 */
async function initialInput(overrides?: Partial<Record<string, unknown>>) {
  const input = buildInitialInput(overrides);
  const fp = input.firstPaymentCollected as { amount: number; collectedAt: string };
  await seedRegistrationFirstPayment(input.studentId, fp.amount, fp.collectedAt);
  return input;
}

describe("StudentContract — para/taksit hesabı (buildInstallmentSchedule, saf fonksiyon)", () => {
  it("eşit bölünen tutar (12000 / 12) tam eşit taksitler üretir", () => {
    const rows = buildInstallmentSchedule({
      totalContractAmount: 12000,
      installmentCount: 12,
      firstDueDate: "2026-09-01T00:00:00.000Z",
    });
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.amount === 1000)).toBe(true);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(12000);
  });

  it("eşit BÖLÜNMEYEN tutar (1000 / 3) toplamı KESİN olarak korur — float yuvarlama yok", () => {
    const rows = buildInstallmentSchedule({
      totalContractAmount: 1000,
      installmentCount: 3,
      firstDueDate: "2026-09-01T00:00:00.000Z",
    });
    expect(rows.map((r) => r.amount)).toEqual([334, 333, 333]);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(1000);
  });

  it("kaparo düşüldükten sonraki tutar üzerinden taksitlendirir", () => {
    const rows = buildInstallmentSchedule({
      totalContractAmount: 10000,
      depositAmount: 1000,
      installmentCount: 3,
      firstDueDate: "2026-09-01T00:00:00.000Z",
    });
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(9000);
  });
});

describe("createStudentContractTool — ilk kayıt", () => {
  it("3 aylık (formal eşik) ilk sözleşme oluşturulabilir — DocumentInstance üretilir", async () => {
    const res = await createStudentContractTool(adminCtx(), await initialInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.contract.versionNumber).toBe(1);
    expect(res.data.contract.contractType).toBe("initial");
    expect(res.data.contract.totalContractAmount).toBe(9000);
    expect(res.data.contract.status).toBe("generated");
    expect(res.data.contract.documentInstanceId).toBeTruthy();
    expect(res.data.contract.contractNumber).toBeTruthy();
    expect(res.data.installments).toHaveLength(3);
    expect(res.data.installments[0]!.amount).toBe(3000);
  });

  it("12 aylık ilk sözleşme — taksit toplamı sözleşme toplamına TAM eşit", async () => {
    const res = await createStudentContractTool(
      adminCtx(),
      await initialInput({ durationMonths: 12, monthlyAmount: 1000, installmentCount: 12, enrollmentEndDate: "2027-09-01T00:00:00.000Z" })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.contract.totalContractAmount).toBe(12000);
    const sum = res.data.installments.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBe(res.data.contract.totalContractAmount);
  });

  it("üretilen anlık görüntü (snapshot) girdilerle birebir eşleşir", async () => {
    const res = await createStudentContractTool(adminCtx(), await initialInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const snap = res.data.contract.contractDataSnapshot;
    expect(snap.programmeName).toBe("Piyano");
    expect(snap.totalContractAmount).toBe(9000);
    expect(snap.installments).toHaveLength(3);
    expect(snap.isMinor).toBe(false); // s1 seed kaydında birthDate yok
  });

  it.each([
    { durationMonths: 13, label: "süre 12'den büyük" },
    { installmentCount: 0, label: "taksit sayısı 0" },
    { monthlyAmount: -100, label: "negatif tutar" },
  ])("geçersiz girdi reddedilir: $label", async (overrides) => {
    const res = await createStudentContractTool(adminCtx(), await initialInput(overrides));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("yalnızca SCHOOL_ADMIN/SUPER_ADMIN oluşturabilir — öğretmen REDDEDİLİR", async () => {
    const res = await createStudentContractTool(teacherCtx(), await initialInput());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("öğrenci/veli sözleşme oluşturamaz", async () => {
    const res = await createStudentContractTool(studentCtx(), await initialInput());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("P0 (2026-08-30) — Kayıt Süresi 5/7/8/9/10/11 aylık planlar (eksik ay kontrolü)", () => {
  it.each([5, 7, 8, 9, 10, 11])(
    "%i aylık sözleşme doğru taksit sayısı/toplam üretir ve yazdırılan HTML'de kullanılmayan taksit satırı KALMAZ",
    async (durationMonths) => {
      const monthlyAmount = 2000;
      const res = await createStudentContractTool(
        adminCtx(),
        await initialInput({
          durationMonths,
          monthlyAmount,
          installmentCount: durationMonths,
          enrollmentEndDate: new Date(Date.UTC(2027, durationMonths, 1)).toISOString(),
        })
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.contract.durationMonths).toBe(durationMonths);
      expect(res.data.contract.totalContractAmount).toBe(durationMonths * monthlyAmount);
      expect(res.data.installments).toHaveLength(durationMonths);
      const sum = res.data.installments.reduce((s, r) => s + r.amount, 0);
      expect(sum).toBe(res.data.contract.totalContractAmount);

      const html = await getContractHtmlTool(adminCtx(), { contractId: res.data.contract.id });
      expect(html.ok).toBe(true);
      if (!html.ok) return;
      // Kullanılan taksit numaraları (ör. 5 aylık için 1-5) HTML'de bir taksit tablosu
      // satırı olarak GEÇER; kullanılmayanlar (6-12) tamamen KALDIRILMIŞ olmalı —
      // ne placeholder token'ı ne de boş "<td></td>...TL" kalıntısı kalır.
      for (let i = durationMonths + 1; i <= 12; i++) {
        expect(html.data.html).not.toContain(`taksit${i}Tarih`);
        expect(html.data.html).not.toContain(`taksit${i}Tutar`);
      }
      expect(html.data.html).not.toMatch(/<td>\s*<\/td>\s*<td>\s*TL<\/td>/);
    }
  );
});

describe("Tanışma paketi (1-2 ay) — formal sözleşme belgesi ÜRETİLMEZ (Faz 1A/1B iş kuralı)", () => {
  it("1 aylık kayıt: status='recorded', DocumentInstance YOK, ödeme planı YİNE de kaydedilir", async () => {
    const res = await createStudentContractTool(
      adminCtx(),
      await initialInput({
        durationMonths: 1,
        installmentCount: 1,
        enrollmentEndDate: "2026-10-01T00:00:00.000Z",
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.contract.status).toBe("recorded");
    expect(res.data.contract.documentInstanceId).toBeUndefined();
    expect(res.data.contract.contractNumber).toBeTruthy(); // referans yine üretilir (belge YOK ama kayıt izlenebilir)
    expect(res.data.contract.totalContractAmount).toBe(3000);
    expect(res.data.installments).toHaveLength(1); // ödeme/taksit kaydı formal olsun olmasın oluşturulur
  });

  it("2 aylık kayıt da trial'dir — formal sözleşme YOK", async () => {
    const res = await createStudentContractTool(
      adminCtx(),
      await initialInput({
        durationMonths: 2,
        installmentCount: 2,
        enrollmentEndDate: "2026-11-01T00:00:00.000Z",
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.contract.status).toBe("recorded");
    expect(res.data.contract.documentInstanceId).toBeUndefined();
  });

  it("trial kaydın HTML'i istenemez — VALIDATION_ERROR, sözleşmeymiş gibi davranılmaz", async () => {
    const created = await createStudentContractTool(
      adminCtx(),
      await initialInput({ durationMonths: 1, installmentCount: 1, enrollmentEndDate: "2026-10-01T00:00:00.000Z" })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const html = await getContractHtmlTool(adminCtx(), { contractId: created.data.contract.id });
    expect(html.ok).toBe(false);
    if (html.ok) return;
    expect(html.error.code).toBe("VALIDATION_ERROR");
  });

  it("trial kayıt yazdırılamaz — VALIDATION_ERROR", async () => {
    const created = await createStudentContractTool(
      adminCtx(),
      await initialInput({ durationMonths: 1, installmentCount: 1, enrollmentEndDate: "2026-10-01T00:00:00.000Z" })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const printed = await printStudentContractTool(adminCtx(), { contractId: created.data.contract.id });
    expect(printed.ok).toBe(false);
    if (printed.ok) return;
    expect(printed.error.code).toBe("VALIDATION_ERROR");
  });

  it("trial kayda imzalı tarama yüklenemez — VALIDATION_ERROR", async () => {
    const created = await createStudentContractTool(
      adminCtx(),
      await initialInput({ durationMonths: 2, installmentCount: 2, enrollmentEndDate: "2026-11-01T00:00:00.000Z" })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const pdfBytes = Buffer.from("%PDF-1.4 fake").toString("base64");
    const res = await uploadStudentContractSignedScanTool(adminCtx(), {
      contractId: created.data.contract.id,
      fileName: "imzali.pdf",
      fileMimeType: "application/pdf",
      fileData: pdfBytes,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });
});

/** Bir sözleşmenin TÜM taksitlerini "paid" yapar — yenileme borç kapısı testlerinde önceki dönemi kapatmak için. */
async function settleAllInstallments(contractId: string) {
  const raw = await fs.readFile(DATA_FILE, "utf8").catch(() => "{}");
  const store = JSON.parse(raw) as { payments?: { id: string; contractId?: string }[] };
  for (const p of store.payments ?? []) {
    if (p.contractId === contractId) {
      await createPaymentTool(adminCtx(), { paymentId: p.id });
    }
  }
}

describe("Sözleşme yenileme/süre uzatma — versiyon zinciri", () => {
  it.each([1, 2, 3, 4, 6, 12])("+%i ay uzatma — yeni versiyon zinciri doğru kurulur (trial/formal eşiği doğru uygulanır)", async (months) => {
    const initial = await createStudentContractTool(adminCtx(), await initialInput());
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    await settleAllInstallments(initial.data.contract.id);

    const renewal = await createStudentContractTool(
      adminCtx(),
      await initialInput({
        contractType: "renewal",
        previousContractId: initial.data.contract.id,
        enrollmentStartDate: initial.data.contract.enrollmentEndDate,
        enrollmentEndDate: "2030-01-01T00:00:00.000Z",
        durationMonths: months,
        installmentCount: months,
        firstDueDate: initial.data.contract.enrollmentEndDate,
      })
    );
    expect(renewal.ok).toBe(true);
    if (!renewal.ok) return;
    expect(renewal.data.contract.versionNumber).toBe(2);
    expect(renewal.data.contract.contractType).toBe("renewal");
    expect(renewal.data.contract.previousContractId).toBe(initial.data.contract.id);
    expect(renewal.data.contract.totalContractAmount).toBe(months * 3000);
    const sum = renewal.data.installments.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBe(renewal.data.contract.totalContractAmount);

    // İş kuralı: +1/+2 ay = trial uzatma (formal belge YOK), +3/+4/+6/+12 = yeni formal sözleşme.
    if (isFormalContractDuration(months)) {
      expect(renewal.data.contract.status).toBe("generated");
      expect(renewal.data.contract.documentInstanceId).toBeTruthy();
    } else {
      expect(renewal.data.contract.status).toBe("recorded");
      expect(renewal.data.contract.documentInstanceId).toBeUndefined();
    }

    // Önceki sözleşme artık "superseded" — ama İÇERİĞİ (immutable snapshot) DEĞİŞMEDİ.
    const oldAfter = await getStudentContractTool(adminCtx(), { contractId: initial.data.contract.id });
    expect(oldAfter.ok).toBe(true);
    if (!oldAfter.ok) return;
    expect(oldAfter.data.contract.status).toBe("superseded");
    expect(oldAfter.data.contract.totalContractAmount).toBe(initial.data.contract.totalContractAmount);
    expect(oldAfter.data.contract.contractDataSnapshot).toEqual(initial.data.contract.contractDataSnapshot);
  });

  it("bitişten ÖNCE başlayan yenileme, gerekçesiz reddedilir; allowOverlap+gerekçe ile kabul edilir", async () => {
    const initial = await createStudentContractTool(adminCtx(), await initialInput());
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    await settleAllInstallments(initial.data.contract.id);

    const overlapping = await createStudentContractTool(
      adminCtx(),
      await initialInput({
        contractType: "renewal",
        previousContractId: initial.data.contract.id,
        enrollmentStartDate: "2026-09-15T00:00:00.000Z", // önceki bitişten (10/01) ÖNCE
      })
    );
    expect(overlapping.ok).toBe(false);

    const withOverlap = await createStudentContractTool(
      adminCtx(),
      await initialInput({
        contractType: "renewal",
        previousContractId: initial.data.contract.id,
        enrollmentStartDate: "2026-09-15T00:00:00.000Z",
        allowOverlap: true,
        overlapReason: "Program erken başlatıldı — veli talebi",
      })
    );
    expect(withOverlap.ok).toBe(true);
  });
});

describe("Nilüfer Acar politikası §4 — yenileme borç kapısı", () => {
  it("önceki dönemden ödenmemiş taksit varken yenileme CONFLICT ile reddedilir", async () => {
    const initial = await createStudentContractTool(adminCtx(), await initialInput());
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    // Owner policy (2026-08-29) — ilk taksit artık kayıt anında ZATEN tahsil edilmiş sayılır
    // (bkz. FIRST_PAYMENT_AT_REGISTRATION_POLICY_REPORT.md); 2. ve sonraki taksitler kasıtlı
    // olarak "pending" bırakıldı — borç bunlardan doğar.
    const firstInstallmentAmount = initial.data.installments[0]!.amount;

    const debtStatus = await getRenewalDebtStatusTool(adminCtx(), { previousContractId: initial.data.contract.id });
    expect(debtStatus.ok).toBe(true);
    if (debtStatus.ok) {
      expect(debtStatus.data.blocksRenewal).toBe(true);
      expect(debtStatus.data.outstandingAmount).toBe(initial.data.contract.totalContractAmount - firstInstallmentAmount);
    }

    const renewal = await createStudentContractTool(
      adminCtx(),
      await initialInput({
        contractType: "renewal",
        previousContractId: initial.data.contract.id,
        enrollmentStartDate: initial.data.contract.enrollmentEndDate,
        enrollmentEndDate: "2030-01-01T00:00:00.000Z",
        firstDueDate: initial.data.contract.enrollmentEndDate,
      })
    );
    expect(renewal.ok).toBe(false);
    if (renewal.ok) return;
    expect(renewal.error.code).toBe("CONFLICT");
    expect(renewal.error.message).toContain("kayıt yenileme işlemi tamamlanamaz");
  });

  it("kısmi ödenmiş (partial) taksit de borç sayılır — kalan tutar bloklar", async () => {
    const initial = await createStudentContractTool(adminCtx(), await initialInput());
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    // Owner policy — 1. taksit kayıt anında zaten tahsil edilmiş/"paid" sayılır; kısmi ödeme
    // senaryosunu 2. (hâlâ "pending" olan) taksit üzerinden test ediyoruz.
    const firstInstallmentAmount = initial.data.installments[0]!.amount;
    const secondInstallment = initial.data.installments[1]!;
    await createPaymentTool(adminCtx(), { paymentId: secondInstallment.paymentId, amount: 1 });

    const debtStatus = await getRenewalDebtStatusTool(adminCtx(), { previousContractId: initial.data.contract.id });
    expect(debtStatus.ok).toBe(true);
    if (debtStatus.ok)
      expect(debtStatus.data.outstandingAmount).toBe(initial.data.contract.totalContractAmount - firstInstallmentAmount - 1);
  });

  it("yetkili gerekçeli override ile borçlu yenileme tamamlanabilir — audit'lenir", async () => {
    const initial = await createStudentContractTool(adminCtx(), await initialInput());
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;

    const renewal = await createStudentContractTool(
      adminCtx(),
      await initialInput({
        contractType: "renewal",
        previousContractId: initial.data.contract.id,
        enrollmentStartDate: initial.data.contract.enrollmentEndDate,
        enrollmentEndDate: "2030-01-01T00:00:00.000Z",
        firstDueDate: initial.data.contract.enrollmentEndDate,
        renewalDebtOverrideReason: "Veli ile mutabık kalınan taksitli kapatma planı — finans onayı",
      })
    );
    expect(renewal.ok).toBe(true);
  });

  it("boş/whitespace override gerekçesi kabul edilmez — yine bloklanır", async () => {
    const initial = await createStudentContractTool(adminCtx(), await initialInput());
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;

    const renewal = await createStudentContractTool(
      adminCtx(),
      await initialInput({
        contractType: "renewal",
        previousContractId: initial.data.contract.id,
        enrollmentStartDate: initial.data.contract.enrollmentEndDate,
        enrollmentEndDate: "2030-01-01T00:00:00.000Z",
        firstDueDate: initial.data.contract.enrollmentEndDate,
        renewalDebtOverrideReason: "   ",
      })
    );
    expect(renewal.ok).toBe(false);
  });
});

describe("Erişim kontrolü — sözleşme okuma", () => {
  it("kurum yönetimi (staff) her zaman erişebilir", async () => {
    const created = await createStudentContractTool(adminCtx(), await initialInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const res = await getStudentContractTool(adminCtx(), { contractId: created.data.contract.id });
    expect(res.ok).toBe(true);
  });

  it("öğrenci/veli yalnızca KENDİ sözleşmesine erişebilir — başka öğrenci REDDEDİLİR", async () => {
    const created = await createStudentContractTool(adminCtx(), await initialInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // "own": u2 için s1'e AKTİF portal erişimi tanınmış — sözleşme s1'e ait.
    await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "u2" }, "s1");
    const own = await getStudentContractTool(studentCtx({ studentId: "s1" }), { contractId: created.data.contract.id });
    expect(own.ok).toBe(true);

    // "other": u5'in HİÇBİR öğrenciye erişimi tanınmadı — AYNI sözleşmeye (s1) erişim REDDEDİLMELİ.
    const other = await getStudentContractTool(studentCtx({ userId: "u5", studentId: "s2" }), {
      contractId: created.data.contract.id,
    });
    expect(other.ok).toBe(false);
    if (other.ok) return;
    expect(other.error.code).toBe("FORBIDDEN");
  });

  it("öğretmen — öğrencisinin sözleşmesine bile erişemez (finansal/hukuki belge, kural: no teacher access)", async () => {
    const created = await createStudentContractTool(adminCtx(), await initialInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // t1, s1'in ders öğretmeni (seed data) — yine de erişim YOK.
    const listRes = await listStudentContractsTool(teacherCtx(), { studentId: "s1" });
    expect(listRes.ok).toBe(false);
    if (listRes.ok) return;
    expect(listRes.error.code).toBe("FORBIDDEN");
  });

  it("olmayan bir sözleşme için NOT_FOUND döner", async () => {
    const res = await getStudentContractTool(adminCtx(), { contractId: "does-not-exist" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("NOT_FOUND");
  });

  it("başka bir tenant'tan erişim NOT_FOUND döner (tenant izolasyonu)", async () => {
    const created = await createStudentContractTool(adminCtx(), await initialInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const res = await getStudentContractTool(adminCtx({ tenantId: "other-tenant" }), {
      contractId: created.data.contract.id,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("NOT_FOUND");
  });
});

describe("Yazdırılabilir HTML ve imzalı tarama yükleme erişimi", () => {
  it("yetkili (staff) belge HTML'ini görüntüleyebilir", async () => {
    const created = await createStudentContractTool(adminCtx(), await initialInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const html = await getContractHtmlTool(adminCtx(), { contractId: created.data.contract.id });
    expect(html.ok).toBe(true);
    if (!html.ok) return;
    expect(html.data.html).toContain(created.data.contract.contractNumber);
  });

  it("başka öğrencinin veli/öğrencisi HTML'e erişemez", async () => {
    const created = await createStudentContractTool(adminCtx(), await initialInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const html = await getContractHtmlTool(studentCtx({ studentId: "s2" }), { contractId: created.data.contract.id });
    expect(html.ok).toBe(false);
  });

  it("yazdırma sonrası durum 'printed' olur", async () => {
    const created = await createStudentContractTool(adminCtx(), await initialInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const printed = await printStudentContractTool(adminCtx(), { contractId: created.data.contract.id });
    expect(printed.ok).toBe(true);
    if (!printed.ok) return;
    expect(printed.data.contract.status).toBe("printed");
    expect(printed.data.contract.printedBy).toBe("u1");
  });

  it("imzalı taranmış nüsha yüklenince durum 'signed' olur — yalnızca staff yükleyebilir", async () => {
    const created = await createStudentContractTool(adminCtx(), await initialInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const pdfBytes = Buffer.from("%PDF-1.4 fake signed contract scan").toString("base64");

    const deniedForStudent = await uploadStudentContractSignedScanTool(studentCtx(), {
      contractId: created.data.contract.id,
      fileName: "imzali.pdf",
      fileMimeType: "application/pdf",
      fileData: pdfBytes,
    });
    expect(deniedForStudent.ok).toBe(false);

    const uploaded = await uploadStudentContractSignedScanTool(adminCtx(), {
      contractId: created.data.contract.id,
      fileName: "imzali.pdf",
      fileMimeType: "application/pdf",
      fileData: pdfBytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    expect(uploaded.data.contract.status).toBe("signed");
    expect(uploaded.data.contract.signedAt).toBeTruthy();
  });

  it("beyan edilen türle uyuşmayan dosya reddedilir (magic-byte kontrolü)", async () => {
    const created = await createStudentContractTool(adminCtx(), await initialInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const fakeButNotPdf = Buffer.from("bu bir pdf degil").toString("base64");
    const res = await uploadStudentContractSignedScanTool(adminCtx(), {
      contractId: created.data.contract.id,
      fileName: "sahte.pdf",
      fileMimeType: "application/pdf",
      fileData: fakeButNotPdf,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Faz 2 — ödeme politikası: kredi kartı 1–5, havale/EFT/nakit ≤15", () => {
  it("resolveContractPaymentDueRule kart için doğru pencere/metni döner", () => {
    const rule = resolveContractPaymentDueRule("credit_card");
    expect(rule.windowStartDay).toBe(1);
    expect(rule.windowEndDay).toBe(5);
    expect(rule.ruleText).toBe("Kredi kartı ödemeleri her ayın 1–5’i arasında yapılmalıdır.");
  });

  it("resolveContractPaymentDueRule havale/nakit için doğru pencere/metni döner", () => {
    for (const method of ["cash", "transfer", undefined] as const) {
      const rule = resolveContractPaymentDueRule(method);
      expect(rule.windowStartDay).toBe(1);
      expect(rule.windowEndDay).toBe(15);
      expect(rule.ruleText).toBe("Havale/EFT/nakit ödemeleri her ayın 1–15’i arasında yapılmalıdır.");
    }
  });

  it("kart taksitleri: ilk taksit girilen tarih, sonrakiler ayın 5'ine normalize edilir", () => {
    const rows = buildInstallmentSchedule({
      totalContractAmount: 9000,
      installmentCount: 3,
      firstDueDate: "2026-09-03T00:00:00.000Z",
      paymentMethod: "credit_card",
    });
    expect(new Date(rows[0]!.dueDate).getUTCDate()).toBe(3);
    expect(new Date(rows[1]!.dueDate).getUTCDate()).toBe(5);
    expect(new Date(rows[2]!.dueDate).getUTCDate()).toBe(5);
  });

  it("havale/nakit taksitleri: ilk taksit girilen tarih, sonrakiler ayın 15'ine normalize edilir", () => {
    const rows = buildInstallmentSchedule({
      totalContractAmount: 9000,
      installmentCount: 3,
      firstDueDate: "2026-09-10T00:00:00.000Z",
      paymentMethod: "transfer",
    });
    expect(new Date(rows[0]!.dueDate).getUTCDate()).toBe(10);
    expect(new Date(rows[1]!.dueDate).getUTCDate()).toBe(15);
    expect(new Date(rows[2]!.dueDate).getUTCDate()).toBe(15);
  });

  it("pencere dışı ilk taksit tarihi, gerekçe verilmeden REDDEDİLİR", async () => {
    const res = await createStudentContractTool(
      adminCtx(),
      await initialInput({ paymentMethod: "credit_card", firstDueDate: "2026-09-20T00:00:00.000Z" })
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("pencere dışı ilk taksit tarihi, gerekçe İLE kabul edilir ve snapshot'a yazılır", async () => {
    const res = await createStudentContractTool(
      adminCtx(),
      await initialInput({
        paymentMethod: "credit_card",
        firstDueDate: "2026-09-20T00:00:00.000Z",
        firstPaymentExceptionReason: "Kayıt ayın normal penceresinden sonra yapıldı.",
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.contract.contractDataSnapshot.firstPaymentExceptionReason).toBe(
      "Kayıt ayın normal penceresinden sonra yapıldı."
    );
    expect(res.data.contract.contractDataSnapshot.paymentDueRuleText).toBe(
      "Kredi kartı ödemeleri her ayın 1–5’i arasında yapılmalıdır."
    );
  });

  it("üretilen HTML sözleşme, ödeme kuralı metnini içerir", async () => {
    const created = await createStudentContractTool(adminCtx(), await initialInput({ paymentMethod: "transfer" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const html = await getContractHtmlTool(adminCtx(), { contractId: created.data.contract.id });
    expect(html.ok).toBe(true);
    if (!html.ok) return;
    expect(html.data.html).toContain("Havale/EFT/nakit ödemeleri her ayın 1–15’i arasında yapılmalıdır.");
  });

  it("preview tool ödeme kuralı metnini ve pencere durumunu döner", async () => {
    const res = await previewContractInstallmentPlanTool(adminCtx(), {
      durationMonths: 3,
      monthlyAmount: 3000,
      installmentCount: 3,
      firstDueDate: "2026-09-01T00:00:00.000Z",
      paymentMethod: "credit_card",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.paymentDueRuleText).toBe("Kredi kartı ödemeleri her ayın 1–5’i arasında yapılmalıdır.");
    expect(res.data.firstDueDateInWindow).toBe(true);
  });
});

describe("Faz 6 — sözleşme başlığı ve dosya adı", () => {
  it("contractTitleFields ilk kayıt için doğru başlık/dosya adı üretir", () => {
    const fields = contractTitleFields({
      contractType: "initial",
      studentName: "Ayşe Öztürk",
      enrollmentStartDate: "2026-09-01T00:00:00.000Z",
      durationMonths: 6,
      versionNumber: 1,
    });
    expect(fields.academicYear).toBe("2026-2027");
    expect(fields.titleMain).toBe("Öğrenci Kayıt Sözleşmesi — Ayşe Öztürk");
    expect(fields.titleSub).toBe("2026-2027 Eğitim Dönemi · 6 Aylık Kayıt · Sürüm 1");
    expect(fields.fileName).toBe("ogrenci-kayit-sozlesmesi-ayse-ozturk-2026-2027-v1.pdf");
  });

  it("contractTitleFields yenileme için 'Sözleşme Yenileme' başlığı üretir", () => {
    const fields = contractTitleFields({
      contractType: "renewal",
      studentName: "Ali Veli",
      enrollmentStartDate: "2027-01-15T00:00:00.000Z",
      durationMonths: 4,
      versionNumber: 2,
    });
    expect(fields.academicYear).toBe("2026-2027");
    expect(fields.titleMain).toBe("Sözleşme Yenileme — Ali Veli");
    expect(fields.fileName).toBe("ogrenci-kayit-sozlesmesi-ali-veli-2026-2027-v2.pdf");
  });

  it("üretilen sözleşmenin HTML başlığı öğrenci adını içerir, jenerik değildir", async () => {
    const created = await createStudentContractTool(adminCtx(), await initialInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const html = await getContractHtmlTool(adminCtx(), { contractId: created.data.contract.id });
    expect(html.ok).toBe(true);
    if (!html.ok) return;
    expect(html.data.titleMain).toContain("Zeynep Arslan");
    expect(html.data.fileName).toMatch(/^ogrenci-kayit-sozlesmesi-.*\.pdf$/);
    expect(html.data.html).toContain("Öğrenci Kayıt Sözleşmesi — Zeynep Arslan");
  });
});

describe("Faz 5 (ENROLLMENT_PAYMENT_RENEWAL_VALIDATION_FIX) — iptal edilmiş sözleşmeden yenileme yapılamaz", () => {
  it("iptal edilmiş bir sözleşme previousContractId olarak verilirse sunucu REDDEDER (bug #6 kök neden — client artık bu durumda yenileme formunu hiç AÇMIYOR, ama sunucu her koşulda otoritedir)", async () => {
    const created = await createStudentContractTool(adminCtx(), await initialInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const cancelled = await cancelStudentContractTool(adminCtx(), { contractId: created.data.contract.id });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.data.contract.status).toBe("cancelled");

    const renewal = await createStudentContractTool(
      adminCtx(),
      await initialInput({
        contractType: "renewal",
        previousContractId: created.data.contract.id,
        enrollmentStartDate: created.data.contract.enrollmentEndDate,
        enrollmentEndDate: "2027-03-01T00:00:00.000Z",
        firstDueDate: created.data.contract.enrollmentEndDate,
      })
    );
    expect(renewal.ok).toBe(false);
    if (renewal.ok) return;
    expect(renewal.error.code).toBe("VALIDATION_ERROR");
    expect(renewal.error.message).toContain("İptal edilmiş");
  });

  it("boş/geçersiz firstDueDate ile sözleşme oluşturma REDDEDİLİR, ASLA RangeError/Invalid time value fırlatmaz (bug #6)", async () => {
    const res = await createStudentContractTool(adminCtx(), await initialInput({ firstDueDate: "" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).not.toMatch(/RangeError|Invalid time value/);
  });
});

describe("Faz 6 — kurumsal kaynaktan taslak + etkinleştirme akışı (stale/eksik şablon kurtarma, bug #5)", () => {
  it("eksik ('metadata-only') bir şablon varken formal sözleşme Şablon Hatası ile REDDEDİLİR; tanılama eksik alanları raporlar; kurumsal taslak oluşturup etkinleştirince ÇALIŞIR ve eski şablon pasifleşir", async () => {
    const incomplete = await createDocumentTemplateTool(adminCtx(), {
      kind: "student_enrollment_contract",
      name: "Eski Şablon (metadata-only)",
      bodyHtml: "<h1>Öğrenci Kayıt Sözleşmesi</h1><p>Referans: {{reference}}</p><p>Öğrenci: {{studentName}}</p>",
    });
    expect(incomplete.ok).toBe(true);
    if (!incomplete.ok) return;

    const rejected = await createStudentContractTool(adminCtx(), await initialInput());
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.error.message).toContain("Şablon Hatası");
    expect(rejected.error.message).toContain("kurumsal kaynaktan");

    const diagnostics = await getContractTemplateDiagnosticsTool(adminCtx());
    expect(diagnostics.ok).toBe(true);
    if (!diagnostics.ok) return;
    expect(diagnostics.data.isReadyForFormalGeneration).toBe(false);
    expect(diagnostics.data.selectedTemplate?.id).toBe(incomplete.data.templateId);
    expect(diagnostics.data.missingRequired.map((m) => m.key)).toContain("titleMain");

    const draft = await createContractTemplateDraftFromCanonicalSourceTool(adminCtx());
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    // Taslak henüz AKTİF DEĞİL — etkinleştirilmeden formal sözleşme hâlâ eski (eksik) şablonu kullanır.
    const stillRejected = await createStudentContractTool(adminCtx(), await initialInput());
    expect(stillRejected.ok).toBe(false);

    const activated = await activateContractTemplateTool(adminCtx(), { templateId: draft.data.templateId });
    expect(activated.ok).toBe(true);

    const created = await createStudentContractTool(adminCtx(), await initialInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.contract.status).toBe("generated");

    const allTemplates = await listAllDocumentTemplatesTool(adminCtx());
    expect(allTemplates.ok).toBe(true);
    if (!allTemplates.ok) return;
    const contractTemplates = allTemplates.data.templates.filter((t) => t.kind === "student_enrollment_contract");
    const activeOnes = contractTemplates.filter((t) => t.active);
    expect(activeOnes).toHaveLength(1);
    expect(activeOnes[0]!.id).toBe(draft.data.templateId);
  });

  it("yalnızca SCHOOL_ADMIN/SUPER_ADMIN kurumsal taslak oluşturabilir/etkinleştirebilir", async () => {
    const draftAsTeacher = await createContractTemplateDraftFromCanonicalSourceTool(teacherCtx());
    expect(draftAsTeacher.ok).toBe(false);
    if (draftAsTeacher.ok) return;
    expect(draftAsTeacher.error.code).toBe("FORBIDDEN");

    const activateAsTeacher = await activateContractTemplateTool(teacherCtx(), { templateId: "dtpl_x" });
    expect(activateAsTeacher.ok).toBe(false);
    if (activateAsTeacher.ok) return;
    expect(activateAsTeacher.error.code).toBe("FORBIDDEN");
  });

  it("P0 selection fix (2026-08-30) — DAHA YENİ ama HENÜZ AKTİFLEŞTİRİLMEMİŞ bir taslak, DAHA ESKİ ama aktif olan eksiksiz şablonun ÜZERİNE ASLA seçilmez (gerçek üretim senaryosu: dtpl_fy9artyvontl/dtpl_jfpy6i01m1de)", async () => {
    const completeBody =
      "<h1>{{titleMain}}</h1><p>{{paymentDueRuleText}} {{totalContractAmountText}} {{signatoryFullName}} {{enrollmentStartDateText}} {{taksit1Tarih}} {{taksit1Tutar}}</p>";
    const activeOlder = await createDocumentTemplateTool(adminCtx(), {
      kind: "student_enrollment_contract",
      name: "Aktif (eski) şablon",
      bodyHtml: completeBody,
    });
    expect(activeOlder.ok).toBe(true);
    if (!activeOlder.ok) return;

    // Kurumsal kaynaktan yeni bir taslak oluştur — DAHA SONRA (daha yeni updatedAt) yaratılır
    // ama BİLİNÇLİ OLARAK etkinleştirilmez (active:false, bkz. createContractTemplateDraftFromCanonicalSource).
    const newerDraft = await createContractTemplateDraftFromCanonicalSourceTool(adminCtx());
    expect(newerDraft.ok).toBe(true);
    if (!newerDraft.ok) return;

    const diagnostics = await getContractTemplateDiagnosticsTool(adminCtx());
    expect(diagnostics.ok).toBe(true);
    if (!diagnostics.ok) return;
    // Tanılama, taslağı DEĞİL, hâlâ aktif+eski şablonu "seçilecek şablon" olarak gösterir.
    expect(diagnostics.data.selectedTemplate?.id).toBe(activeOlder.data.templateId);

    const created = await createStudentContractTool(adminCtx(), await initialInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.contract.status).toBe("generated");
    expect(created.data.contract.templateVersion).toBeDefined();

    const allTemplates = await listAllDocumentTemplatesTool(adminCtx());
    expect(allTemplates.ok).toBe(true);
    if (!allTemplates.ok) return;
    const draftRow = allTemplates.data.templates.find((t) => t.id === newerDraft.data.templateId);
    // Taslak store'da HÂLÂ active:false — sözleşme üretimi onu SESSİZCE aktifleştirmedi.
    expect(draftRow?.active).toBe(false);
  });
});

/**
 * P0-3 (2026-08-29, owner-approved revizyon) — kurumsal kaynak gövdesi
 * (STUDENT_ENROLLMENT_CONTRACT_BODY) telafi/ödeme metinleri güncellendi;
 * bu test SADECE gövde metnini DEĞİL, taslak→etkinleştir→sözleşme üret→HTML
 * render UÇTAN UCA akışını (test-scoped, ephemeral dosya — GERÇEK/production
 * şablonu ETKİLENMEZ) doğrular ("test PDF ile doğrulanmalı" gereksinimi).
 */
describe("P0-3 — owner-approved sözleşme revizyonu uçtan uca doğrulama", () => {
  it("taslak etkinleştirilince üretilen GERÇEK sözleşme HTML'i yeni telafi (30 gün, yıl-tamamı) ve ödeme (1-15 dahil) metnini içerir", async () => {
    const draft = await createContractTemplateDraftFromCanonicalSourceTool(adminCtx());
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const activated = await activateContractTemplateTool(adminCtx(), { templateId: draft.data.templateId });
    expect(activated.ok).toBe(true);

    const created = await createStudentContractTool(adminCtx(), await initialInput({ paymentMethod: "transfer" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const html = await getContractHtmlTool(adminCtx(), { contractId: created.data.contract.id });
    expect(html.ok).toBe(true);
    if (!html.ok) return;

    expect(html.data.html).toContain("30 (otuz) takvim günü içinde kullanılmalıdır");
    expect(html.data.html).toContain("2026-2027 eğitim yılının tamamında");
    expect(html.data.html).not.toContain("iptalin gerçekleştiği ay içerisinde");
    expect(html.data.html).toContain("iki gün dahil");
    expect(html.data.html).toContain("Havale/EFT/nakit ödemeleri her ayın 1–15’i arasında yapılmalıdır.");
  });
});

describe("2026-2027 sözleşme kaynağı — yeni checkbox/alan placeholder'ları", () => {
  it("formatCheckboxOptionsText — eşleşen seçenek işaretlenir, diğerleri boş kalır", () => {
    expect(formatCheckboxOptionsText([30, 40, 50], 40, "dakika")).toBe("☐ 30 dakika    ☑ 40 dakika    ☐ 50 dakika");
  });

  it("formatCheckboxOptionsText — seçeneklerle eşleşmeyen değer sessizce yanlış işaretlenmez, gerçek değer eklenir", () => {
    const text = formatCheckboxOptionsText([30, 40, 50], 45, "dakika");
    expect(text).toContain("☐ 30 dakika");
    expect(text).toContain("☐ 40 dakika");
    expect(text).toContain("☐ 50 dakika");
    expect(text).toContain("(kayıtlı değer: 45 dakika)");
  });

  it("formatCheckboxOptionsText — undefined seçili değer hiçbirini işaretlemez", () => {
    const text = formatCheckboxOptionsText([1, 2], undefined, "ders");
    expect(text).toBe("☐ 1 ders    ☐ 2 ders");
  });

  it("createContract — ders süresi/haftalık sıklık/taahhüt süresi/KDV/KVKK/foto-video alanları üretilen HTML'e yansır", async () => {
    const created = await createStudentContractTool(
      adminCtx(),
      await initialInput({ durationMonths: 6, kvkkNoticeDelivered: true, photoVideoConsent: { granted: true, representativeName: "Selin Arslan", relationship: "veli", scopes: ["website", "in_house_board"] } })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const html = await getContractHtmlTool(adminCtx(), { contractId: created.data.contract.id });
    expect(html.ok).toBe(true);
    if (!html.ok) return;
    // s1 seed verisinde weeklyLessonCount=1, lessonDurationMinutes YOK — gerçek değer sessizce yanlış işaretlenmemeli.
    expect(html.data.html).toContain("☑ 1 ders    ☐ 2 ders");
    expect(html.data.html).toContain("☑ 6 Ay");
    expect(html.data.html).toContain("Dahil"); // vatInclusive belirtilmemiş → varsayılan "Dahil"
    expect(html.data.html).toContain("☑ Evet    ☐ Hayır"); // KVKK teslim edildi işaretlendi
  });

  it("createContract — branchOptionsText/studentNationalId/vatInclusive=false gibi ön-hesaplanmış alanlar birebir render edilir", async () => {
    await seedRegistrationFirstPayment("s1", 3000, "2026-09-01T00:00:00.000Z");
    const { contract } = await createContract({
      tenantId: DEFAULT_TENANT_ID,
      studentId: "s1",
      contractType: "initial",
      programmeName: "Piyano",
      enrollmentStartDate: "2026-09-01T00:00:00.000Z",
      enrollmentEndDate: "2026-12-01T00:00:00.000Z",
      durationMonths: 3,
      monthlyAmount: 3000,
      installmentCount: 3,
      firstDueDate: "2026-09-01T00:00:00.000Z",
      signatoryFullName: "Selin Arslan",
      isMinor: false,
      studentName: "Zeynep Arslan",
      institutionName: "Nilüfer Acar Müzik Akademisi",
      institutionAddress: "Erzene Mah.",
      createdBy: "u1",
      branchOptionsText: "☑ Merkez Şube: Erzene Mah.    ☐ Evka-3 Şube: 119/5 Sk.",
      studentNationalId: "12345678901",
      vatInclusive: false,
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-09-01T00:00:00.000Z" },
    });
    const html = await getContractHtmlTool(adminCtx(), { contractId: contract.id });
    expect(html.ok).toBe(true);
    if (!html.ok) return;
    expect(html.data.html).toContain("☑ Merkez Şube: Erzene Mah.");
    expect(html.data.html).toContain("12345678901");
    expect(html.data.html).toContain("Hariç");
  });

  it("photoVideoConsent.scopes — yeni 5 kanaldan seçilenler SocialMediaConsent kaydına aynen yazılır", async () => {
    const created = await createStudentContractTool(
      adminCtx(),
      await initialInput({
        photoVideoConsent: {
          granted: true,
          representativeName: "Selin Arslan",
          relationship: "veli",
          scopes: ["print_materials", "digital_ads", "in_house_board"],
        },
      })
    );
    expect(created.ok).toBe(true);
    const consent = await getSocialMediaConsentTool(adminCtx(), { studentId: "s1" });
    expect(consent.ok).toBe(true);
    if (!consent.ok) return;
    expect(consent.data.consent?.scopes).toEqual(["print_materials", "digital_ads", "in_house_board"]);
  });
});

describe("Owner policy (2026-08-30, final) — İlk ödeme kayıt anında alınır, normaldir, istisna değildir; initial sözleşme bu ödemeyi YENİDEN KULLANIR", () => {
  it("FORMAL (>=3 ay) kayıt, öğrencinin kayıt anında tahsil edilmiş ödemesi (registration_first_payment) YOKSA REDDEDİLİR", async () => {
    const input = buildInitialInput(); // kasıtlı: seedRegistrationFirstPayment ÇAĞRILMADI
    const res = await createStudentContractTool(adminCtx(), input);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).toContain("İlk ödeme kayıt sırasında tahsil edilmeden kayıt tamamlanamaz.");
  });

  it("registration first payment: kayıt anında tahsil edilen ödeme sözleşme oluşturunca YENİDEN KULLANILIR — tek gerçek Payment satırı, ikinci kez oluşmaz/paid yapılmaz/toplama iki kez eklenmez", async () => {
    const input = await initialInput();
    const res = await createStudentContractTool(adminCtx(), input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.installments[0]!.status).toBe("paid");
    expect(res.data.installments[0]!.paidAmount).toBe(res.data.installments[0]!.amount);
    expect(res.data.installments[1]!.status).toBe("pending");
    expect(res.data.installments[2]!.status).toBe("pending");
    // Toplam sözleşme tutarı ilk ödeme dahil TEK bir kez sayılır — çift sayım yok.
    const sumOfInstallments = res.data.installments.reduce((s, i) => s + i.amount, 0);
    expect(sumOfInstallments).toBe(res.data.contract.totalContractAmount);

    // Store'da bu öğrenci için TEK bir `registration_first_payment` satırı var — createStudentTool
    // ve createContract AYNI satırı paylaşıyor, ikinci bir Payment kaydı OLUŞMADI (seed
    // verisindeki AYRI eski `p1` ödemesiyle karışmasın diye source'a göre filtrelenir).
    const { readData } = await import("../store-json");
    const data = await readData();
    const regRows = data.payments.filter((p) => p.studentId === "s1" && p.source === "registration_first_payment");
    expect(regRows).toHaveLength(1);
    expect(regRows[0]!.contractId).toBe(res.data.contract.id);
    expect(regRows[0]!.installmentSequence).toBe(1);
    expect(regRows[0]!.status).toBe("paid");
    expect(regRows[0]!.id).toBe(res.data.installments[0]!.paymentId);
    // 1. taksit için AYRICA bir "contract" kaynaklı Payment satırı YARATILMADI.
    const duplicateContractFirstInstallment = data.payments.filter(
      (p) => p.studentId === "s1" && p.source === "contract" && p.installmentSequence === 1
    );
    expect(duplicateContractFirstInstallment).toHaveLength(0);
  });

  it("retry/double submit idempotent — aynı öğrenci için kayıt anı ödemesi tekrar seed edilse bile TEK satır kalır", async () => {
    const input = await initialInput();
    const fp = input.firstPaymentCollected as { amount: number; collectedAt: string };
    await seedRegistrationFirstPayment("s1", fp.amount, fp.collectedAt); // ikinci "retry" çağrısı
    const { readData } = await import("../store-json");
    const data = await readData();
    expect(data.payments.filter((p) => p.studentId === "s1" && p.source === "registration_first_payment")).toHaveLength(1);
    const res = await createStudentContractTool(adminCtx(), input);
    expect(res.ok).toBe(true);
  });

  it("kayıt anındaki ödeme tutarı hesaplanan 1. taksit tutarıyla eşleşmezse reddedilir (veri bütünlüğü)", async () => {
    const input = buildInitialInput();
    await seedRegistrationFirstPayment("s1", 1, input.enrollmentStartDate as string);
    const res = await createStudentContractTool(adminCtx(), input);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).toContain("eşleşmiyor");
  });

  it("TRIAL (<3 ay) kayıtta kayıt anı ödemesi ZORUNLU DEĞİLDİR — formal olmayan kayıt için politika kapsamı dışı", async () => {
    const { firstPaymentCollected: _omit, ...input } = buildInitialInput({
      durationMonths: 1,
      installmentCount: 1,
      enrollmentEndDate: "2026-10-01T00:00:00.000Z",
    });
    const res = await createStudentContractTool(adminCtx(), input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.installments[0]!.status).toBe("pending");
  });

  it("kayıt tarihi ile enrollmentStartDate (ders/eğitim başlangıcı) FARKLI olsa da istisna/gerekçe GEREKTİRMEZ — normaldir", async () => {
    // Kayıt: 31 Ağustos 2026. Eğitim/ders başlangıcı: 7 Eylül 2026 — bilinçli olarak farklı.
    const input = buildInitialInput({ enrollmentStartDate: "2026-09-07T00:00:00.000Z" });
    const fp = input.firstPaymentCollected as { amount: number };
    await seedRegistrationFirstPayment("s1", fp.amount, "2026-08-31T00:00:00.000Z");
    const res = await createStudentContractTool(adminCtx(), input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.installments[0]!.status).toBe("paid");
    // Sunucu snapshot'ında bu farktan dolayı bir gerekçe zorlanmadı.
    expect(res.data.contract).toBeTruthy();
  });

  it("sadece ayın 5/15'inden sonraki bir firstDueDate (vade penceresi) TEK BAŞINA ilk ödeme istisnası GEREKTİRMEZ — bu ayrı bir kontrol", async () => {
    // firstDueDate pencere dışı ama gerekçesi verilmiş (mevcut/önceden var olan kontrol);
    // firstPaymentCollected.collectedAt kayıt tarihiyle AYNI — bu senaryo firstPaymentExceptionReason'ı
    // yalnızca PENCERE kontrolü için gerektirir, "kayıt tarihinden farklı" kontrolünü TETİKLEMEZ.
    const res = await createStudentContractTool(
      adminCtx(),
      await initialInput({
        firstDueDate: "2026-09-20T00:00:00.000Z",
        firstPaymentExceptionReason: "İlk taksit vadesi ayın 20'sine planlandı — kurum onayı.",
      })
    );
    expect(res.ok).toBe(true);
  });
});

describe("computeContractEndDate — müşterinin sözleşme bitiş tercihi (tarih bazlı / takvim ayı sonu)", () => {
  it("15 Eylül + 3 ay + tarih bazlı → 15 Aralık", () => {
    expect(computeContractEndDate("2026-09-15", 3, "date_based")).toBe("2026-12-15");
  });

  it("15 Eylül + 3 ay + takvim ayı sonu → 31 Aralık", () => {
    expect(computeContractEndDate("2026-09-15", 3, "month_end")).toBe("2026-12-31");
  });

  it("varsayılan tercih tarih bazlıdır (preference verilmezse)", () => {
    expect(computeContractEndDate("2026-09-15", 3)).toBe("2026-12-15");
  });

  it("ay sonu taşması tarih bazlı modda hedef ayın son gününe kenetlenir (31 Ocak + 1 ay → 28/29 Şubat)", () => {
    expect(computeContractEndDate("2026-01-31", 1, "date_based")).toBe("2026-02-28");
  });

  it("takvim ayı sonu modunda başlangıç günü sonucu etkilemez", () => {
    expect(computeContractEndDate("2026-09-01", 3, "month_end")).toBe("2026-12-31");
    expect(computeContractEndDate("2026-09-30", 3, "month_end")).toBe("2026-12-31");
  });
});

// P0 (2026-09-03) — uçtan uca: createStudentContractTool → createContract →
// buildPerLessonInstallmentSchedule zincirinin GERÇEK bir per-lesson öğrenci
// için doğru çalıştığını doğrular (yalnız pure-function testleri değil).
describe("createStudentContractTool — per-lesson öğrenci (usePerLessonBilling)", () => {
  async function seedPerLessonStudent(overrides?: { weeklyLessonCount?: number; monthlyFee?: number }) {
    const { readData, writeData } = await import("../store-json");
    const data = await readData();
    const monthlyFee = overrides?.monthlyFee ?? 1500;
    const weeklyLessonCount = overrides?.weeklyLessonCount ?? 1;
    const derivedPerLessonAmount = Math.round(monthlyFee / (weeklyLessonCount * 4));
    data.students.push({
      id: "s_perlesson",
      name: "Per Lesson Öğrenci",
      email: "",
      phone: "5551234567",
      parentName: "Veli",
      parentPhone: "5559876543",
      branchId: "erzene",
      instruments: ["Piyano"],
      teacherId: "t1",
      weeklyLessonCount,
      monthlyFee,
      derivedPerLessonAmount,
      enrollmentStartDate: "2026-09-17",
      active: true,
      notes: "",
      createdAt: "2026-09-17T00:00:00.000Z",
      lessonDurationMinutes: 40,
    } as unknown as (typeof data.students)[number]);
    // Eylül: yalnız 1 ders (17 Eylül'ün kendisi) → eşik (3) altı → birleşir.
    // Ekim: 4 ders (5,12,19,26).
    const lessonDates = ["2026-09-17", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
    for (const [i, day] of lessonDates.entries()) {
      data.lessons.push({
        id: `les_pl_${i}`,
        studentId: "s_perlesson",
        teacherId: "t1",
        roomId: "r1",
        branchId: "erzene",
        instrument: "Piyano",
        startAt: `${day}T10:00:00.000Z`,
        endAt: `${day}T10:40:00.000Z`,
        type: "regular",
        status: "scheduled",
      } as unknown as (typeof data.lessons)[number]);
    }
    await writeData(data);
    return { monthlyFee, derivedPerLessonAmount };
  }

  it("17 Eylül kayıt, Eylül'de 1 ders (<3) → Eylül+Ekim TEK birleştirilmiş ilk tahsilatta, Kasım'dan itibaren normal dönem ücreti", async () => {
    const { monthlyFee, derivedPerLessonAmount } = await seedPerLessonStudent();
    const { addRegistrationFirstPayment } = await import("../store-json");
    const septAmount = 1 * derivedPerLessonAmount;
    const octAmount = 4 * derivedPerLessonAmount;
    const combinedAmount = septAmount + octAmount;
    await addRegistrationFirstPayment({
      studentId: "s_perlesson",
      method: "cash",
      amount: combinedAmount,
      collectedAt: "2026-09-17",
      receivedByUserId: "u1",
    });

    const res = await createStudentContractTool(adminCtx(), {
      studentId: "s_perlesson",
      contractType: "initial",
      programmeName: "Piyano",
      enrollmentStartDate: "2026-09-17",
      enrollmentEndDate: "2026-11-30",
      durationMonths: 3,
      monthlyAmount: monthlyFee,
      installmentCount: 3,
      firstDueDate: "2026-09-17",
      signatoryFullName: "Veli Adı",
      signatoryRelationship: "veli",
      usePerLessonBilling: true,
      firstPaymentExceptionReason: "Kayıt tarihi (17 Eylül) kurumun 1-15 ödeme penceresi dışında — normal kayıt anı tahsilatı.",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const [first, second] = res.data.installments;
    expect(first!.amount).toBe(combinedAmount);
    expect(first!.kind).toBe("first_collection_combined");
    expect(first!.periodLabel).toContain("Eylül");
    expect(first!.periodLabel).toContain("Ekim");
    expect(first!.breakdown).toEqual([
      { periodLabel: expect.stringContaining("Eylül") as unknown as string, amount: septAmount },
      { periodLabel: "Ekim 2026", amount: octAmount },
    ]);
    expect(second!.kind).toBe("period_fee");
    expect(second!.periodLabel).toBe("Kasım 2026");
    expect(second!.amount).toBe(0); // Kasım'da hiç ders yok (seed'de) → 0, kopyalanmadı

    // Toplam sözleşme tutarı = taksit satırlarının toplamı (item 7 gereksinimi).
    const sum = res.data.installments.reduce((s, i) => s + i.amount, 0);
    expect(sum).toBe(res.data.contract.totalContractAmount);
  });

  it("kayıt ayında 4+ ders varsa birleşme OLMAZ, ilk ay kendi tutarında kalır, sonraki aya kopyalanmaz", async () => {
    const { readData, writeData, addRegistrationFirstPayment } = await import("../store-json");
    const data = await readData();
    const monthlyFee = 4000;
    const weeklyLessonCount = 1;
    const derivedPerLessonAmount = Math.round(monthlyFee / (weeklyLessonCount * 4));
    data.students.push({
      id: "s_perlesson2",
      name: "Per Lesson Öğrenci 2",
      email: "",
      phone: "5551112222",
      parentName: "Veli",
      parentPhone: "5559991111",
      branchId: "erzene",
      instruments: ["Piyano"],
      teacherId: "t1",
      weeklyLessonCount,
      monthlyFee,
      derivedPerLessonAmount,
      enrollmentStartDate: "2026-09-01",
      active: true,
      notes: "",
      createdAt: "2026-09-01T00:00:00.000Z",
      lessonDurationMinutes: 40,
    } as unknown as (typeof data.students)[number]);
    // Eylül: 4 ders (eşik üstü) → birleşmez.
    const septDates = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"];
    const octDates = ["2026-10-05", "2026-10-12"];
    for (const [i, day] of [...septDates, ...octDates].entries()) {
      data.lessons.push({
        id: `les_pl2_${i}`,
        studentId: "s_perlesson2",
        teacherId: "t1",
        roomId: "r1",
        branchId: "erzene",
        instrument: "Piyano",
        startAt: `${day}T10:00:00.000Z`,
        endAt: `${day}T10:40:00.000Z`,
        type: "regular",
        status: "scheduled",
      } as unknown as (typeof data.lessons)[number]);
    }
    await writeData(data);
    const septAmount = 4 * derivedPerLessonAmount;
    await addRegistrationFirstPayment({
      studentId: "s_perlesson2",
      method: "cash",
      amount: septAmount,
      collectedAt: "2026-09-01",
      receivedByUserId: "u1",
    });

    const res = await createStudentContractTool(adminCtx(), {
      studentId: "s_perlesson2",
      contractType: "initial",
      programmeName: "Piyano",
      enrollmentStartDate: "2026-09-01",
      enrollmentEndDate: "2026-10-31",
      durationMonths: 2,
      monthlyAmount: monthlyFee,
      installmentCount: 2,
      firstDueDate: "2026-09-01",
      signatoryFullName: "Veli Adı",
      signatoryRelationship: "veli",
      usePerLessonBilling: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [first, second] = res.data.installments;
    expect(first!.kind).toBe("first_collection");
    expect(first!.amount).toBe(septAmount);
    expect(second!.amount).toBe(2 * derivedPerLessonAmount); // Ekim kendi (farklı) tutarı, Eylül'e eşit KOPYALANMADI
    expect(second!.amount).not.toBe(first!.amount);
  });
});
