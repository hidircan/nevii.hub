import { describe, it, expect } from "vitest";
import { auditRangeUtc } from "../audit/log";
import { describeAuditEvent } from "../audit/humanize";

/** 2026-10-15 — Denetim Kaydı saat filtresi İstanbul (UTC+3) duvar saatidir; sunucuda UTC [gte, lt). */
describe("auditRangeUtc", () => {
  it("yalnız tarih: başlangıç 00:00 TSİ, bitiş günü tamamen dahil", () => {
    const r = auditRangeUtc("2026-10-15", "2026-10-15");
    expect(r.gte?.toISOString()).toBe("2026-10-14T21:00:00.000Z");
    expect(r.lt?.toISOString()).toBe("2026-10-15T21:00:00.000Z");
  });

  it("tarih + saat: bitiş dakikası dahil; gece yarısı sınırı doğru güne düşer", () => {
    const r = auditRangeUtc("2026-10-15T23:30", "2026-10-15T23:59");
    expect(r.gte?.toISOString()).toBe("2026-10-15T20:30:00.000Z");
    expect(r.lt?.toISOString()).toBe("2026-10-15T21:00:00.000Z");
  });

  it("geçersiz değer yok sayılır", () => {
    expect(auditRangeUtc("15.10.2026", "")).toEqual({ gte: undefined, lt: undefined });
  });
});

describe("describeAuditEvent — değişen alan adı", () => {
  it("güncellemede hangi bilginin değiştiği yazılır, değer yazılmaz", () => {
    const s = describeAuditEvent({
      action: "teacher.profile_update",
      entityType: "Teacher",
      actorName: "Yönetici",
      entityName: "Örnek Öğretmen",
      changes: [{ field: "phone", from: "0500", to: "0501" }],
    });
    expect(s).toMatch(/Örnek Öğretmen \(öğretmen\) kaydında .+ bilgisini güncelledi\./);
    expect(s).not.toMatch(/0501/);
  });
});
