/**
 * Veritabanı hata sınıflandırması — allowlist ve SIZINTI YOKLUĞU testleri.
 *
 * Bu testler gerçek bir veritabanına BAĞLANMAZ. Kullanılan hata nesneleri
 * UYDURMA'dır; gerçek kimlik bilgisi içermez.
 */
import { describe, expect, it } from "vitest";
import {
  classifyDbError,
  DB_ERROR_CLASSES,
  type DbErrorClass,
} from "../db/error-class";

function pgError(code: string, message = "boom"): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

describe("classifyDbError", () => {
  it("28P01 (yanlış parola) → AUTHENTICATION", () => {
    expect(classifyDbError(pgError("28P01", 'password authentication failed for user "postgres"'))).toBe(
      "AUTHENTICATION"
    );
  });

  it("28000 ve tanınmayan 28xxx → AUTHENTICATION", () => {
    expect(classifyDbError(pgError("28000"))).toBe("AUTHENTICATION");
    expect(classifyDbError(pgError("28P02"))).toBe("AUTHENTICATION");
  });

  it("sertifika zinciri hataları → TLS", () => {
    expect(classifyDbError(pgError("SELF_SIGNED_CERT_IN_CHAIN", "self-signed certificate in certificate chain"))).toBe("TLS");
    expect(classifyDbError(pgError("CERT_HAS_EXPIRED"))).toBe("TLS");
  });

  it("soket/DNS hataları → NETWORK", () => {
    expect(classifyDbError(pgError("ENOTFOUND"))).toBe("NETWORK");
    expect(classifyDbError(pgError("ECONNREFUSED"))).toBe("NETWORK");
    expect(classifyDbError(pgError("ETIMEDOUT"))).toBe("NETWORK");
  });

  it("kodsuz connection timeout mesajı → NETWORK", () => {
    expect(classifyDbError(new Error("timeout exceeded when trying to connect"))).toBe("NETWORK");
  });

  it("pooler/pgbouncer'a özgü durumlar → POOLER", () => {
    expect(classifyDbError(pgError("53300"))).toBe("POOLER");
    expect(classifyDbError(pgError("42P05"))).toBe("POOLER");
    expect(classifyDbError(new Error("Max client connections reached"))).toBe("POOLER");
  });

  it("eksik tablo/veritabanı → SCHEMA", () => {
    expect(classifyDbError(pgError("42P01"))).toBe("SCHEMA");
    expect(classifyDbError(pgError("3D000"))).toBe("SCHEMA");
    expect(classifyDbError(pgError("P1003"))).toBe("SCHEMA");
  });

  it("Prisma kodları kendi anlamlarına eşlenir", () => {
    expect(classifyDbError(pgError("P1000"))).toBe("AUTHENTICATION");
    expect(classifyDbError(pgError("P1001"))).toBe("NETWORK");
  });

  it("kodsuz Prisma hatası → PRISMA", () => {
    const error = Object.assign(new Error("something opaque"), {
      name: "PrismaClientInitializationError",
    });
    expect(classifyDbError(error)).toBe("PRISMA");
  });

  it("tanınmayan her şey → UNKNOWN (fail-closed)", () => {
    expect(classifyDbError(new Error("totally novel failure"))).toBe("UNKNOWN");
    expect(classifyDbError(pgError("99999", "novel"))).toBe("UNKNOWN");
    expect(classifyDbError(null)).toBe("UNKNOWN");
    expect(classifyDbError(undefined)).toBe("UNKNOWN");
    expect(classifyDbError("bir string")).toBe("UNKNOWN");
    expect(classifyDbError({})).toBe("UNKNOWN");
  });

  it("hiçbir girdi için kapalı listenin dışına çıkmaz", () => {
    const inputs: unknown[] = [
      pgError("28P01"),
      new Error("x"),
      null,
      42,
      { code: 123 },
      Symbol("s"),
    ];
    for (const input of inputs) {
      expect(DB_ERROR_CLASSES).toContain(classifyDbError(input) as DbErrorClass);
    }
  });

  it("SECRET SIZINTISI YOK: çıktı yalnız sabit etikettir, hata metnini taşımaz", () => {
    const leaky = pgError(
      "28P01",
      'password authentication failed for user "postgres.vxzewyiwfshobjizzetw" (pw=hunter2) ' +
        "postgresql://postgres:hunter2@aws-1-eu-central-1.pooler.supabase.com:6543/postgres"
    );
    const result = classifyDbError(leaky);
    expect(result).toBe("AUTHENTICATION");
    expect(result).not.toMatch(/hunter2|supabase|postgres|:\/\//i);
    expect(result.length).toBeLessThanOrEqual("AUTHENTICATION".length);
  });
});
