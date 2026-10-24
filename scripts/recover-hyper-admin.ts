/**
 * 2026-10-14 — NeviiOS platform sahibi (HYPER_ADMIN) hesabının KURTARILMASI (owner onayıyla, tek seferlik).
 *
 * Kanıt (canlı, salt-okunur): `user_hyper_admin` (info@neviihub.com, tenant_platform) 2026-10-03 05:50Z'de giriş
 * yapıp sıfırlama istemiş; bugün User tablosunda HİÇ HYPER_ADMIN satırı yok, production env'de AUTH_HYPER_ADMIN_* yok.
 * db modunda giriş yalnız DB'ye bakar → giriş `no_such_user`, "şifremi unuttum" sessizce hiçbir şey yapmaz.
 * Satırın nasıl kaybolduğu kanıtlanamadı (silme denetimi yok; 10-03 demo temizliği silinen satırlarında yok).
 *
 * Bu betik YENİ bir ikinci platform sahibi oluşturmaz: yalnız HİÇ HYPER_ADMIN yokken, aynı kimlikle
 * (`user_hyper_admin`, denetim geçmişi bağlı kalır) tek hesabı geri koyar. Şifre ÜRETİLMEZ/YAZDIRILMAZ: hesap
 * kullanılamaz rastgele bir hash ile açılır; owner şifresini platform girişindeki "Şifremi unuttum" ile kendi belirler.
 * E-posta ulaşmazsa yedek: `--prompt-password` (gizli girişle, yalnız owner makinesinde; değer hiçbir yere yazılmaz).
 *
 * Reddettiği durumlar: herhangi bir HYPER_ADMIN varsa; e-posta HERHANGİ bir hesapta (pasif/silinmiş dahil) varsa;
 * `user_hyper_admin` kimliği başka bir durumdaysa; `--target-ref` DATABASE_URL'deki proje ile eşleşmiyorsa.
 *
 * Kullanım (önce kuru çalıştırma):
 *   STORE_MODE=db DATABASE_URL=<hedef> npx tsx scripts/recover-hyper-admin.ts --email info@neviihub.com --target-ref <proje-ref>
 *   ... --apply                       # satırı yazar
 *   ... --apply --prompt-password     # (yedek) şifreyi gizli girişle belirler
 */
import "dotenv/config";
import crypto from "crypto";
import { createInterface } from "readline";
import { prisma } from "../src/lib/db";
import { hashPasswordSync } from "../src/lib/auth/password";
import { PLATFORM_TENANT_ID } from "../src/lib/auth/config";

const HYPER_ID = "user_hyper_admin";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function promptHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  let asked = false;
  out._writeToOutput = (s: string) => {
    if (!asked) { out.output.write(s); asked = true; }
  };
  return new Promise((resolve) => rl.question(question, (v) => { rl.close(); process.stdout.write("\n"); resolve(v); }));
}

async function main() {
  if (process.env.STORE_MODE !== "db") throw new Error("Bu betik yalnız STORE_MODE=db ile çalışır.");
  const apply = process.argv.includes("--apply");
  const email = (arg("--email") ?? "").trim().toLowerCase();
  const targetRef = arg("--target-ref") ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("--email <platform sahibinin giriş adresi> zorunlu.");
  // Hedef doğrulaması: proje kimliği DATABASE_URL'de geçmeli (URL/şifre yazdırılmaz).
  if (!targetRef || !(process.env.DATABASE_URL ?? "").includes(targetRef)) {
    throw new Error("--target-ref, DATABASE_URL'deki Supabase proje kimliğiyle eşleşmiyor (yanlış veritabanı?). Durduruldu.");
  }
  console.log(`== HYPER_ADMIN kurtarma — ${apply ? "APPLY" : "DRY-RUN (yazım yok)"} ==`);

  const [hypers, byEmail, byId, tenant] = await Promise.all([
    prisma.user.findMany({ where: { role: "HYPER_ADMIN" }, select: { id: true, active: true, deletedAt: true } }),
    prisma.user.findFirst({ where: { email }, select: { id: true, role: true, tenantId: true } }),
    prisma.user.findUnique({ where: { id: HYPER_ID }, select: { id: true, role: true, active: true, deletedAt: true } }),
    prisma.tenant.findUnique({ where: { id: PLATFORM_TENANT_ID }, select: { id: true } }),
  ]);
  console.log(`Mevcut HYPER_ADMIN sayısı: ${hypers.length}; e-posta başka hesapta: ${byEmail ? `evet (${byEmail.role})` : "hayır"}; ${HYPER_ID}: ${byId ? "var" : "yok"}; platform tenant: ${tenant ? "var" : "yok"}`);
  if (hypers.length > 0) throw new Error("Zaten bir HYPER_ADMIN var — ikinci platform sahibi oluşturulmaz. Mevcut hesabın durumunu inceleyin.");
  if (byEmail) throw new Error("Bu e-posta başka bir hesaba kayıtlı — rol yükseltme/hesap devri yapılmaz.");
  if (byId) throw new Error(`${HYPER_ID} kimliği başka bir durumda mevcut — elle inceleme gerekli, otomatik değişiklik yapılmaz.`);
  if (!tenant) throw new Error(`${PLATFORM_TENANT_ID} tenant'ı yok — platform tenant'ı olmadan HYPER_ADMIN girişi çalışmaz (önce inceleyin).`);
  if (!apply) {
    console.log("Kuru çalıştırma: koşullar uygun. Yazmak için --apply ekleyin (owner onayıyla).");
    return;
  }
  let passwordHash = hashPasswordSync(crypto.randomBytes(48).toString("base64url")); // kullanılamaz; kimse bilmez
  if (process.argv.includes("--prompt-password")) {
    const pw = await promptHidden("Yeni platform şifresi (en az 16 karakter, ekranda görünmez): ");
    if (pw.length < 16) throw new Error("Şifre en az 16 karakter olmalı. Hiçbir şey yazılmadı.");
    passwordHash = hashPasswordSync(pw);
  }
  await prisma.user.create({
    data: { id: HYPER_ID, tenantId: PLATFORM_TENANT_ID, email, passwordHash, role: "HYPER_ADMIN", active: true },
  });
  console.log(`Yazıldı: ${HYPER_ID} (HYPER_ADMIN, ${PLATFORM_TENANT_ID}). Şifre: ${process.argv.includes("--prompt-password") ? "girdiğiniz değer" : "belirlenmedi — /platform/giris → Şifremi unuttum"}.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
