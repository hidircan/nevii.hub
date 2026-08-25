import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { updateStudentProfileTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import {
  isValidPaymentDueRange,
  normalizePaymentDueRanges,
  formatPaymentDueRanges,
  effectivePaymentDueRanges,
} from "../payment-due-ranges";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("normalizePaymentDueRanges", () => {
  it("çakışan aralıkları birleştirir", () => {
    expect(
      normalizePaymentDueRanges([
        { start: 10, end: 15 },
        { start: 12, end: 20 },
      ])
    ).toEqual([{ start: 10, end: 20 }]);
  });

  it("bitişik (boşluksuz) aralıkları birleştirir", () => {
    expect(
      normalizePaymentDueRanges([
        { start: 1, end: 5 },
        { start: 6, end: 10 },
      ])
    ).toEqual([{ start: 1, end: 10 }]);
  });

  it("ayrık aralıkları birleştirmeden, başlangıca göre sıralı döner", () => {
    expect(
      normalizePaymentDueRanges([
        { start: 20, end: 25 },
        { start: 1, end: 5 },
      ])
    ).toEqual([
      { start: 1, end: 5 },
      { start: 20, end: 25 },
    ]);
  });
});

describe("isValidPaymentDueRange", () => {
  it("1-31 dışını veya start>end'i geçersiz sayar", () => {
    expect(isValidPaymentDueRange({ start: 1, end: 5 })).toBe(true);
    expect(isValidPaymentDueRange({ start: 5, end: 1 })).toBe(false);
    expect(isValidPaymentDueRange({ start: 0, end: 5 })).toBe(false);
    expect(isValidPaymentDueRange({ start: 1, end: 32 })).toBe(false);
  });
});

describe("formatPaymentDueRanges / effectivePaymentDueRanges", () => {
  it("boşsa 'Belirtilmemiş' döner", () => {
    expect(formatPaymentDueRanges(undefined)).toBe("Belirtilmemiş");
    expect(formatPaymentDueRanges([])).toBe("Belirtilmemiş");
  });

  it("tek günlü aralığı 'X.', çok günlüyü 'X–Y.' biçiminde gösterir", () => {
    expect(
      formatPaymentDueRanges([
        { start: 5, end: 5 },
        { start: 10, end: 15 },
      ])
    ).toBe("Ayın 5., 10–15. günü/günleri");
  });

  it("paymentDueRanges yoksa legacy paymentDueDay'den tek-elemanlı aralık türetir", () => {
    expect(effectivePaymentDueRanges({ paymentDueDay: 7 })).toEqual([{ start: 7, end: 7 }]);
    expect(effectivePaymentDueRanges({})).toEqual([]);
    expect(
      effectivePaymentDueRanges({ paymentDueRanges: [{ start: 1, end: 5 }], paymentDueDay: 20 })
    ).toEqual([{ start: 1, end: 5 }]);
  });
});

describe("updateStudentProfileTool · Faz 1A entegrasyonu", () => {
  it("paymentDueRanges verilince normalize edilir ve legacy paymentDueDay ilk aralığın başlangıcıyla senkron olur", async () => {
    const res = await updateStudentProfileTool(ctx(), {
      studentId: "s1",
      paymentDueRanges: [
        { start: 10, end: 15 },
        { start: 1, end: 5 },
        { start: 14, end: 20 },
      ],
    });
    expect(res.ok).toBe(true);

    const data = await readData();
    const student = data.students.find((s) => s.id === "s1");
    expect(student?.paymentDueRanges).toEqual([
      { start: 1, end: 5 },
      { start: 10, end: 20 },
    ]);
    expect(student?.paymentDueDay).toBe(1);
  });

  it("boş dizi gönderilirse tüm aralıklar ve legacy gün temizlenir", async () => {
    await updateStudentProfileTool(ctx(), { studentId: "s1", paymentDueRanges: [{ start: 3, end: 8 }] });
    const res = await updateStudentProfileTool(ctx(), { studentId: "s1", paymentDueRanges: [] });
    expect(res.ok).toBe(true);

    const data = await readData();
    const student = data.students.find((s) => s.id === "s1");
    expect(student?.paymentDueRanges).toEqual([]);
    expect(student?.paymentDueDay).toBeUndefined();
  });

  it("paymentDueRanges verilmeyen bir güncellemede mevcut legacy paymentDueDay dokunulmadan kalır", async () => {
    await updateStudentProfileTool(ctx(), { studentId: "s1", paymentDueRanges: [{ start: 9, end: 9 }] });
    const res = await updateStudentProfileTool(ctx(), { studentId: "s1", phone: "0 555 000 00 00" });
    expect(res.ok).toBe(true);

    const data = await readData();
    const student = data.students.find((s) => s.id === "s1");
    expect(student?.paymentDueDay).toBe(9);
  });

  it("geçersiz aralık (start > end) reddedilir", async () => {
    const res = await updateStudentProfileTool(ctx(), {
      studentId: "s1",
      paymentDueRanges: [{ start: 10, end: 5 }],
    });
    expect(res.ok).toBe(false);
  });
});
