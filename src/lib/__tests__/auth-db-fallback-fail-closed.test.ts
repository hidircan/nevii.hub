/**
 * Güvenlik (2026-10-02): STORE_MODE=db'de kullanıcı sorgusu hata verirse giriş, kaynak koddaki
 * bootstrap/demo şifrelerine GERİ DÜŞMEMELİ. Aksi halde geçici bir DB hatasında, DB'de şifresi
 * değiştirilmiş ya da kilitlenmiş hesaplara (ör. AI_AGENT, kurum sahibi) koddaki demo şifreyle girilebilir.
 * Senaryo: ilk sorgu (kullanıcı) hata verir, yaşam döngüsü okuması çalışır.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config")>()),
  STORE_MODE: "db",
  isDbMode: true,
}));
vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    user: {
      findFirst: async () => {
        throw new Error("Connection terminated unexpectedly");
      },
    },
  }),
  prisma: {},
}));
vi.mock("@/lib/platform/store-ext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../platform/store-ext")>()),
  getUserLifecycle: async () => null,
}));

import { authenticateUser } from "../auth/users";

/** users.ts içindeki `email: "…"` + `password: process.env.X || "…"` çiftleri (kaynak koddaki varsayılanlar). */
function bootstrapDefaults(): { email: string; password: string }[] {
  const src = readFileSync(path.join(process.cwd(), "src/lib/auth/users.ts"), "utf8");
  return [...src.matchAll(/email:\s*"([^"]+)",\s*\n\s*password:\s*process\.env\.[A-Z0-9_]+\s*\|\|\s*"([^"]+)"/g)].map((m) => ({
    email: m[1],
    password: m[2],
  }));
}

describe("db modunda DB hatası → bootstrap şifrelerine geri düşülmez (fail-closed)", () => {
  it("AI_AGENT, koddaki demo şifresiyle giremez", async () => {
    expect(await authenticateUser("agent@notaplan.app", "demo-agent")).toBeNull();
  });

  it("hiçbir bootstrap hesabı koddaki varsayılan şifresiyle giremez", async () => {
    const pairs = bootstrapDefaults();
    expect(pairs.length).toBeGreaterThan(10);
    for (const { email, password } of pairs) {
      expect(await authenticateUser(email, password), `bootstrap hesabı #${pairs.indexOf(pairs.find((p) => p.email === email)!)}`).toBeNull();
    }
  });
});
