/**
 * Test ortamı hedef guard'ı — fail-closed davranış testleri.
 *
 * Bu testler GERÇEK bir veritabanına BAĞLANMAZ; guard saf bir sınıflandırma
 * fonksiyonu olduğu için secret gerektirmeden tam kapsam alınabiliyor.
 * Kullanılan connection string'ler UYDURMA'dır (parola alanı literal
 * "redacted"), gerçek kimlik bilgisi içermez.
 */
import { describe, expect, it, afterEach, vi } from "vitest";
import {
  assertDbStoreMode,
  assertMigrationSafeConnection,
  assertNotProductionRuntime,
  assertSeedTarget,
  assertTestDatabaseTarget,
  classifyDatabaseTarget,
  missingEnvNames,
  PRODUCTION_SUPABASE_REF,
  TEST_SUPABASE_REF,
  productionLeakWarnings,
} from "../env/test-target-guard";

// Uzak test DB'si yok (local-first); varsayılan TEST_SUPABASE_REF boştur. Testler uydurma bir test ref'iyle çalışır.
vi.hoisted(() => {
  process.env.TEST_SUPABASE_REF = "testref0000000000000";
});

const PROD_POOLER = `postgresql://postgres.${PRODUCTION_SUPABASE_REF}:redacted@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;
const TEST_POOLER_SESSION = `postgresql://postgres.${TEST_SUPABASE_REF}:redacted@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;
const TEST_POOLER_TRANSACTION = `postgresql://postgres.${TEST_SUPABASE_REF}:redacted@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;
const TEST_DIRECT = `postgresql://postgres:redacted@db.${TEST_SUPABASE_REF}.supabase.co:5432/postgres`;
const PROD_DIRECT = `postgresql://postgres:redacted@db.${PRODUCTION_SUPABASE_REF}.supabase.co:5432/postgres`;

const savedEnv = { ...process.env };
afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...savedEnv };
});

describe("classifyDatabaseTarget", () => {
  it("pooler kullanıcı adından production ref'ini tanır", () => {
    expect(classifyDatabaseTarget(PROD_POOLER).classification).toBe("production");
  });

  it("pooler kullanıcı adından test ref'ini tanır", () => {
    expect(classifyDatabaseTarget(TEST_POOLER_SESSION).classification).toBe("test");
  });

  it("doğrudan db.<ref>.supabase.co host'undan da ref'i tanır", () => {
    expect(classifyDatabaseTarget(TEST_DIRECT).classification).toBe("test");
    expect(classifyDatabaseTarget(PROD_DIRECT).classification).toBe("production");
  });

  it("geçiş sonrası: canlı proje ve gerçek veri taşıyan eski test projesi production sayılır", () => {
    const pooler = (ref: string) => `postgresql://postgres.${ref}:redacted@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`;
    expect(classifyDatabaseTarget(pooler("wsbucznpujcfzhitzrbl")).classification).toBe("production");
    expect(classifyDatabaseTarget(pooler("vxzewyiwfshobjizzetw")).classification).toBe("production");
    expect(() => assertTestDatabaseTarget(pooler("vxzewyiwfshobjizzetw"))).toThrow(/PRODUCTION/);
  });

  it("TEST_SUPABASE_REF verilmezse hiçbir uzak hedef 'test' sayılmaz", async () => {
    vi.resetModules();
    delete process.env.TEST_SUPABASE_REF;
    const guard = await import("../env/test-target-guard");
    expect(guard.TEST_SUPABASE_REF).toBe("");
    expect(guard.classifyDatabaseTarget(TEST_POOLER_SESSION).classification).toBe("unknown");
  });

  it("bilinmeyen host'u 'unknown' sayar (güvenli varsayım yapmaz)", () => {
    expect(
      classifyDatabaseTarget("postgresql://user:redacted@some-other-db.example.com:5432/app")
        .classification
    ).toBe("unknown");
  });

  it("localhost'u 'local' sayar", () => {
    expect(classifyDatabaseTarget("postgresql://me@localhost:5432/notaplan").classification).toBe(
      "local"
    );
  });

  it("eksik ve bozuk değerleri ayrı ayrı sınıflandırır", () => {
    expect(classifyDatabaseTarget(undefined).classification).toBe("missing");
    expect(classifyDatabaseTarget("   ").classification).toBe("missing");
    expect(classifyDatabaseTarget("bu bir url değil").classification).toBe("unparseable");
    expect(classifyDatabaseTarget("mysql://user:redacted@host:3306/db").classification).toBe(
      "unparseable"
    );
  });

  it("pooler modunu port ve pgbouncer bayrağından çıkarır", () => {
    expect(classifyDatabaseTarget(TEST_POOLER_TRANSACTION).poolerMode).toBe("transaction");
    expect(classifyDatabaseTarget(TEST_POOLER_SESSION).poolerMode).toBe("session-or-direct");
  });

  it("safeLabel parola, kullanıcı adı, ref veya tam host SIZDIRMAZ", () => {
    for (const url of [PROD_POOLER, TEST_POOLER_SESSION, TEST_DIRECT]) {
      const { safeLabel, hostSuffix } = classifyDatabaseTarget(url);
      expect(safeLabel).not.toContain("redacted");
      expect(safeLabel).not.toContain("postgres.");
      expect(safeLabel).not.toContain(PRODUCTION_SUPABASE_REF);
      expect(safeLabel).not.toContain(TEST_SUPABASE_REF);
      expect(hostSuffix.startsWith("*.")).toBe(true);
    }
  });
});

describe("assertTestDatabaseTarget — fail-closed", () => {
  it("production hedefini REDDEDER", () => {
    expect(() => assertTestDatabaseTarget(PROD_POOLER)).toThrow(/PRODUCTION/);
  });

  it("bilinmeyen, yerel, eksik ve bozuk hedefleri REDDEDER", () => {
    for (const url of [
      "postgresql://user:redacted@other.example.com:5432/app",
      "postgresql://me@localhost:5432/notaplan",
      undefined,
      "bu bir url değil",
    ]) {
      expect(() => assertTestDatabaseTarget(url)).toThrow(/doğrulanamadı/);
    }
  });

  it("yalnızca test hedefini kabul eder", () => {
    expect(assertTestDatabaseTarget(TEST_POOLER_SESSION).classification).toBe("test");
  });

  it("hata mesajı secret SIZDIRMAZ", () => {
    try {
      assertTestDatabaseTarget(PROD_POOLER);
      throw new Error("beklenen hata atılmadı");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain("redacted");
      expect(message).not.toContain(PRODUCTION_SUPABASE_REF);
    }
  });
});

describe("assertSeedTarget — demo/seed yalnız yerel/test DB'ye yazar", () => {
  it("yerel, test ve DATABASE_URL'siz (json) çalışmayı kabul eder", () => {
    expect(assertSeedTarget("postgresql://me@127.0.0.1:5432/neviihub_dev").classification).toBe("local");
    expect(assertSeedTarget(TEST_POOLER_SESSION).classification).toBe("test");
    expect(assertSeedTarget(undefined).classification).toBe("missing");
  });
  it("production, gerçek veri taşıyan eski test projesi ve belirsiz hedefi REDDEDER", () => {
    expect(() => assertSeedTarget(PROD_POOLER)).toThrow(/REDDEDİLDİ/);
    expect(() => assertSeedTarget("postgresql://postgres.vxzewyiwfshobjizzetw:redacted@aws-1-ap-south-1.pooler.supabase.com:6543/postgres")).toThrow(/REDDEDİLDİ/);
    expect(() => assertSeedTarget("postgresql://u:redacted@some-other-db.example.com:5432/app")).toThrow(/REDDEDİLDİ/);
  });
});

describe("assertMigrationSafeConnection", () => {
  it("test hedefi olsa bile transaction pooler'ı (6543/pgbouncer) REDDEDER", () => {
    expect(() => assertMigrationSafeConnection(TEST_POOLER_TRANSACTION)).toThrow(
      /transaction-mode pooler/
    );
  });

  it("test hedefi + session pooler'ı kabul eder", () => {
    expect(assertMigrationSafeConnection(TEST_POOLER_SESSION).poolerMode).toBe("session-or-direct");
  });

  it("production hedefini session pooler'da bile REDDEDER", () => {
    expect(() => assertMigrationSafeConnection(PROD_POOLER)).toThrow(/PRODUCTION/);
  });
});

describe("runtime guard'ları", () => {
  it("NODE_ENV=production'da durur", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertNotProductionRuntime()).toThrow(/PRODUCTION/);
  });

  it("VERCEL_ENV=production'da durur (NODE_ENV başka olsa bile)", () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.VERCEL_ENV = "production";
    expect(() => assertNotProductionRuntime()).toThrow(/PRODUCTION/);
  });

  it("VERCEL_ENV=preview'da geçer", () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.VERCEL_ENV = "preview";
    expect(() => assertNotProductionRuntime()).not.toThrow();
  });

  it("STORE_MODE=json/memory iken DB migration/seed'i REDDEDER", () => {
    process.env.STORE_MODE = "json";
    expect(() => assertDbStoreMode()).toThrow(/STORE_MODE=json/);
    process.env.STORE_MODE = "memory";
    expect(() => assertDbStoreMode()).toThrow(/STORE_MODE=memory/);
    delete process.env.STORE_MODE;
    expect(() => assertDbStoreMode()).toThrow(/STORE_MODE=json/);
  });

  it("STORE_MODE=db iken geçer", () => {
    process.env.STORE_MODE = "db";
    expect(() => assertDbStoreMode()).not.toThrow();
  });
});

describe("env envanteri ve production sızıntı uyarıları", () => {
  it("yalnızca eksik değişken İSİMLERİNİ döner, değerleri değil", () => {
    process.env.JWT_SECRET = "bu-deger-asla-donmemeli";
    delete process.env.APP_BASE_URL;
    const missing = missingEnvNames(["JWT_SECRET", "APP_BASE_URL"]);
    expect(missing).toEqual(["APP_BASE_URL"]);
    expect(missing.join(" ")).not.toContain("bu-deger-asla-donmemeli");
  });

  it("boş/whitespace değeri eksik sayar", () => {
    process.env.SMTP_HOST = "   ";
    expect(missingEnvNames(["SMTP_HOST"])).toEqual(["SMTP_HOST"]);
  });

  it("production APP_BASE_URL'i test ortamında uyarı olarak işaretler", () => {
    process.env.APP_BASE_URL = "https://neviihub.com";
    expect(productionLeakWarnings().join(" ")).toMatch(/APP_BASE_URL/);
  });

  it("test APP_BASE_URL ve localhost uyarı üretmez", () => {
    process.env.APP_BASE_URL = "https://test.neviihub.com";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_APP_BASE_URL;
    expect(productionLeakWarnings()).toEqual([]);
    process.env.APP_BASE_URL = "http://localhost:3000";
    expect(productionLeakWarnings()).toEqual([]);
  });

  it("production Supabase URL'i test ortamında uyarı üretir", () => {
    process.env.APP_BASE_URL = "https://test.neviihub.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;
    expect(productionLeakWarnings().join(" ")).toMatch(/PRODUCTION Supabase/);
  });
});
