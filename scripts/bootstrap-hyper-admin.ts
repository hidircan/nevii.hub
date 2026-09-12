/**
 * NeviiHub — ilk HYPER_ADMIN bootstrap (yalnız STORE_MODE=db).
 *
 * Public kayıt ve panelden rol yükseltme YOKTUR. Bu betik:
 *   AUTH_HYPER_ADMIN_EMAIL
 *   AUTH_HYPER_ADMIN_PASSWORD  (min 16 karakter)
 *   isteğe bağlı PLATFORM_TENANT_ID (varsayılan tenant_platform)
 *
 * ile sentetik platform tenant + tek HYPER_ADMIN kullanıcısı oluşturur.
 *
 * Kullanım:
 *   AUTH_HYPER_ADMIN_EMAIL=hyper@nevii-hub.test \
 *   AUTH_HYPER_ADMIN_PASSWORD='en-az-16-karakter' \
 *   STORE_MODE=db npx tsx scripts/bootstrap-hyper-admin.ts
 *
 * Geliştirme json/memory varsayılanı (`hyper@nevii-hub.test`) login
 * şemasındaki z.string().email() ile geçerlidir; hyper@localhost geçmez.
 *
 * Idempotent: aynı e-posta varsa rolünü yükseltmez (güvenlik). Yalnız
 * yoksa oluşturur.
 */
import "dotenv/config";
import { hashPasswordSync } from "../src/lib/auth/password";
import { PLATFORM_TENANT_ID } from "../src/lib/auth/config";

async function main() {
  if ((process.env.STORE_MODE ?? "json") !== "db") {
    throw new Error("Bu betik yalnız STORE_MODE=db ile çalışır.");
  }
  const email = (process.env.AUTH_HYPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.AUTH_HYPER_ADMIN_PASSWORD ?? "";
  if (!email || password.length < 16) {
    throw new Error("AUTH_HYPER_ADMIN_EMAIL ve AUTH_HYPER_ADMIN_PASSWORD (min 16) zorunlu.");
  }

  const { getPrisma } = await import("../src/lib/db");
  const prisma = getPrisma();

  await prisma.tenant.upsert({
    where: { id: PLATFORM_TENANT_ID },
    create: {
      id: PLATFORM_TENANT_ID,
      name: "NeviiHub Platform",
      slug: "neviihub-platform",
      active: false,
      planKey: "professional",
    },
    update: {},
  });

  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    if (existing.role === "HYPER_ADMIN") {
      console.log("HYPER_ADMIN zaten var; dokunulmadı:", email);
      return;
    }
    throw new Error(
      `E-posta başka bir rolle kayıtlı (${existing.role}). Rol yükseltme bu betikte bilinçli olarak yok.`
    );
  }

  await prisma.user.create({
    data: {
      id: "user_hyper_admin",
      tenantId: PLATFORM_TENANT_ID,
      email,
      passwordHash: hashPasswordSync(password),
      role: "HYPER_ADMIN",
      active: true,
    },
  });
  console.log("HYPER_ADMIN oluşturuldu:", email);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
