/**
 * §C.2/C.6 (2026-09-09) — TAHSİLAT NOTU + TAHSİLATI ALAN KULLANICI.
 *
 * Audit sonucu: `Payment.paymentNote` ve `Payment.receivedByUserId` alanları
 * TİPTE, JSON store'da ve Prisma şemasında ZATEN vardı; `collectPayment` de
 * ikisini yazıyordu. Eksik olan tek şey, Yoklama Takvimi tahsilat yollarının
 * notu GÖNDERMESİYDİ (yeni alan/migration GEREKMEDİ — bkz. LESSONS_LEARNED
 * 2026-09-08 "eksik özelliği aramadan önce backend'i audit edin").
 *
 * Bu dosya, notun ve tahsilatı alan kullanıcının GERÇEKTEN kalıcı olduğunu
 * kilitler — "girildi ama kaydedilmedi" sessiz veri kaybını engeller.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { collectAttendanceCalendarPaymentTool } from "../services/tools";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(userId = "u1"): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId, tenantId: DEFAULT_TENANT_ID, channel: "web" };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  // Sözleşmesiz öğrenci senaryosu: önceki test dosyasının sözleşmeleri s1'e taşınmasın.
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
});

async function monthlyPlanPayment(studentId = "s1") {
  const data = await readData();
  return data.payments.find((p) => p.studentId === studentId && p.source === "monthly_plan");
}

describe("§C.2 — ay kutusundan alınan tahsilatın notu KALICIDIR", () => {
  it("not verilirse Payment.paymentNote'a yazılır", async () => {
    const res = await collectAttendanceCalendarPaymentTool(ctx(), {
      studentId: "s1",
      month: "2026-09",
      amount: 3000,
      method: "transfer",
      note: "Dekont 44812 — babası havale etti",
    });
    expect(res.ok).toBe(true);

    const payment = await monthlyPlanPayment();
    expect(payment?.paymentNote).toBe("Dekont 44812 — babası havale etti");
    expect(payment?.paidAmount).toBe(3000);
  });

  it("not verilmezse alan boş kalır (uydurma metin ÜRETİLMEZ)", async () => {
    const res = await collectAttendanceCalendarPaymentTool(ctx(), {
      studentId: "s1",
      month: "2026-09",
      amount: 3000,
    });
    expect(res.ok).toBe(true);
    expect((await monthlyPlanPayment())?.paymentNote).toBeUndefined();
  });

  it("aynı ay yeniden tahsil edilirse not GÜNCELLENİR, eski not takılı kalmaz", async () => {
    await collectAttendanceCalendarPaymentTool(ctx(), {
      studentId: "s1", month: "2026-09", amount: 3200, note: "İlk kayıt",
    });
    await collectAttendanceCalendarPaymentTool(ctx(), {
      studentId: "s1", month: "2026-09", amount: 3500, note: "Düzeltildi — eksik tutar tamamlandı",
    });
    const payment = await monthlyPlanPayment();
    expect(payment?.paymentNote).toBe("Düzeltildi — eksik tutar tamamlandı");
    expect(payment?.amount).toBe(3500);
  });

  it("200 karakterden uzun not reddedilir (sessizce kırpılmaz)", async () => {
    const res = await collectAttendanceCalendarPaymentTool(ctx(), {
      studentId: "s1", month: "2026-09", amount: 3000, note: "x".repeat(201),
    });
    expect(res.ok).toBe(false);
  });
});

describe("§C.6 — tahsilatı ALAN kullanıcı kalıcı kimlikle saklanır", () => {
  it("tahsilatı yapan kullanıcının id'si Payment.receivedByUserId'e yazılır", async () => {
    const res = await collectAttendanceCalendarPaymentTool(ctx("u_ezgi"), {
      studentId: "s1", month: "2026-09", amount: 3000, note: "Nakit alındı",
    });
    expect(res.ok).toBe(true);
    const payment = await monthlyPlanPayment();
    // Kimlik ADA değil ID'ye bağlıdır — kullanıcı sonradan yeniden
    // adlandırılsa/pasife alınsa bile tarihsel kayıt bozulmaz.
    expect(payment?.receivedByUserId).toBe("u_ezgi");
  });

  it("farklı kullanıcı aynı ödemeyi düzeltirse tahsilatı alan GÜNCELLENİR", async () => {
    await collectAttendanceCalendarPaymentTool(ctx("u_ezgi"), {
      studentId: "s1", month: "2026-09", amount: 3000,
    });
    await collectAttendanceCalendarPaymentTool(ctx("u_nihal"), {
      studentId: "s1", month: "2026-09", amount: 3500, note: "Eksik tutar tamamlandı",
    });
    expect((await monthlyPlanPayment())?.receivedByUserId).toBe("u_nihal");
  });
});
