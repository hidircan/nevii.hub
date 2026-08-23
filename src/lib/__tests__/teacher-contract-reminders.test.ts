import { describe, it, expect } from "vitest";
import {
  classifyTeacherContractReminder,
  buildTeacherContractReminderKind,
  buildTeacherContractReminderText,
} from "../teacher-contract-reminders";

const TZ = "Europe/Istanbul";

describe("classifyTeacherContractReminder", () => {
  it("30 gün kala aday sayılır", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    const end = new Date("2026-01-31T10:00:00Z").toISOString();
    const result = classifyTeacherContractReminder({ active: true, contractEndDate: end }, now, TZ);
    expect(result).toEqual({ daysLeft: 30 });
  });

  it("31 gün kala aday değildir", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    const end = new Date("2026-02-01T10:00:00Z").toISOString();
    expect(classifyTeacherContractReminder({ active: true, contractEndDate: end }, now, TZ)).toBeNull();
  });

  it("bitiş geçmişse aday değildir", () => {
    const now = new Date("2026-01-10T10:00:00Z");
    const end = new Date("2026-01-01T10:00:00Z").toISOString();
    expect(classifyTeacherContractReminder({ active: true, contractEndDate: end }, now, TZ)).toBeNull();
  });

  it("pasif öğretmen aday değildir", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    const end = new Date("2026-01-10T10:00:00Z").toISOString();
    expect(classifyTeacherContractReminder({ active: false, contractEndDate: end }, now, TZ)).toBeNull();
  });

  it("contractEndDate yoksa aday değildir", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    expect(classifyTeacherContractReminder({ active: true, contractEndDate: undefined }, now, TZ)).toBeNull();
  });

  it("bugün bitiyorsa daysLeft 0 döner", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    const end = new Date("2026-01-01T10:00:00Z").toISOString();
    expect(classifyTeacherContractReminder({ active: true, contractEndDate: end }, now, TZ)).toEqual({ daysLeft: 0 });
  });
});

describe("buildTeacherContractReminderKind", () => {
  it("teacherId + normalize edilmiş tarihi kodlar", () => {
    expect(buildTeacherContractReminderKind("t1", "2026-01-31T10:00:00.000Z")).toBe(
      "teacher_contract_expiring:t1:2026-01-31"
    );
  });

  it("aynı öğretmen farklı bitiş tarihi için farklı anahtar üretir", () => {
    const a = buildTeacherContractReminderKind("t1", "2026-01-31");
    const b = buildTeacherContractReminderKind("t1", "2026-02-15");
    expect(a).not.toBe(b);
  });
});

describe("buildTeacherContractReminderText", () => {
  it("0 gün için doğal 'bugün bitiyor' metni üretir", () => {
    const { body } = buildTeacherContractReminderText("Ada Öğretmen", "t1", "2026-01-01", 0);
    expect(body).toContain("bugün bitiyor");
    expect(body).toContain("/panel/ogretmenler/t1");
  });

  it("N gün için tarih + kalan gün metni üretir", () => {
    const { body } = buildTeacherContractReminderText("Ada Öğretmen", "t1", "2026-01-31", 15);
    expect(body).toContain("Ada Öğretmen öğretmeninin sözleşmesi");
    expect(body).toContain("(15 gün kaldı)");
  });
});
