/**
 * `pg` bağlantı normalizasyonu — TLS pinleme testleri.
 *
 * Gerçek bir veritabanına BAĞLANMAZ. Kullanılan connection string'ler
 * UYDURMA'dır (parola alanı literal "redacted").
 */
import { X509Certificate } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolvePgConnection, SUPABASE_ROOT_CA_2021 } from "../db/connection";

/** Supabase'in yayınladığı prod-ca-2021 kök sertifikasının SHA-256 parmak izi. */
const SUPABASE_ROOT_FINGERPRINT =
  "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA";

const POOLER = "postgresql://postgres.abc:redacted@aws-1-eu-central-1.pooler.supabase.com:6543/postgres";

describe("SUPABASE_ROOT_CA_2021", () => {
  it("Supabase'in yayınladığı kök sertifikayla aynı (parmak izi pinlenmiş)", () => {
    const cert = new X509Certificate(SUPABASE_ROOT_CA_2021);
    expect(cert.fingerprint256).toBe(SUPABASE_ROOT_FINGERPRINT);
    expect(cert.subject).toContain("Supabase Root 2021 CA");
  });

  it("henüz süresi dolmamış", () => {
    expect(new Date(new X509Certificate(SUPABASE_ROOT_CA_2021).validTo).getTime()).toBeGreaterThan(
      Date.now()
    );
  });
});

describe("resolvePgConnection", () => {
  it("Supabase host'unda kök CA'yı pinler ve doğrulamayı AÇIK bırakır", () => {
    const resolved = resolvePgConnection(POOLER);
    expect(resolved.ssl).toBeDefined();
    expect(resolved.ssl?.rejectUnauthorized).toBe(true);
    expect(resolved.ssl?.ca).toBe(SUPABASE_ROOT_CA_2021);
    expect(resolved.ssl?.servername).toBe("aws-1-eu-central-1.pooler.supabase.com");
  });

  it("belirsiz ssl parametrelerini string'den TEMİZLER — yoksa pg açık ssl'i ezer", () => {
    const resolved = resolvePgConnection(`${POOLER}?sslmode=require&pgbouncer=true&connection_limit=1`);
    const url = new URL(resolved.connectionString);
    expect(url.searchParams.get("sslmode")).toBeNull();
    expect(url.searchParams.get("uselibpqcompat")).toBeNull();
    // ssl DIŞI parametreler korunur
    expect(url.searchParams.get("pgbouncer")).toBe("true");
    expect(url.searchParams.get("connection_limit")).toBe("1");
    expect(resolved.ssl?.rejectUnauthorized).toBe(true);
  });

  it("Supabase doğrudan host'unda (db.<ref>.supabase.co) da pinler", () => {
    expect(resolvePgConnection("postgresql://postgres:redacted@db.abc.supabase.co:5432/postgres").ssl)
      .toBeDefined();
  });

  it("Supabase dışı host'a dokunmaz", () => {
    const local = "postgresql://user:redacted@localhost:5432/notaplan";
    expect(resolvePgConnection(local)).toEqual({ connectionString: local });
  });

  it("ayrıştırılamayan string'i olduğu gibi geçirir", () => {
    expect(resolvePgConnection("not a url")).toEqual({ connectionString: "not a url" });
  });

  it("parolayı kaybetmez", () => {
    expect(new URL(resolvePgConnection(POOLER).connectionString).password).toBe("redacted");
  });
});
