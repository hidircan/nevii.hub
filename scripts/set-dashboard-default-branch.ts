/**
 * C — Günlük Özet varsayılan şubesi ataması (idempotent, ops aracı).
 *
 * Owner kararı (2026-09-20): Nihal varsayılan olarak **Evka 3**, Ezgi
 * varsayılan olarak **Erzene** özeti görür. İkisi de panelden diğer şubeye
 * geçebilir ve "Varsayılanım yap" ile kendi tercihini değiştirebilir —
 * burada yapılan yalnız İLK değerdir.
 *
 * Neden ürün kodunda değil bir script'te: "kim hangi şubeye bakar" bir
 * KİŞİ verisidir, iş kuralı değil. Kişiler değişir; kodda sabitlemek
 * her değişiklikte deploy gerektirir ve rol/yetki ile karıştırılır.
 * Bu ayar YALNIZCA görünürlük tercihidir — tenant/rol kapsamını ETKİLEMEZ.
 *
 * Kullanım:
 *   npx tsx scripts/set-dashboard-default-branch.ts                # kuru çalışma (hiçbir şey yazmaz)
 *   npx tsx scripts/set-dashboard-default-branch.ts --apply        # uygular
 *
 * Hedef DB `DATABASE_URL`'den okunur ve production ise REDDEDİLİR
 * (bkz. src/lib/env/test-target-guard.ts).
 */
import "dotenv/config";
import { assertTestDatabaseTarget, classifyDatabaseTarget } from "../src/lib/env/test-target-guard";
import { getUserPreferences, saveUserPreferences } from "../src/lib/user-preferences";

/** E-posta → varsayılan şube kimliği. Kullanıcı kimliği değil E-POSTA ile eşleştirilir:
 *  davetle oluşan hesapların `User.id`'si üretilir, sabit değildir. */
const DEFAULTS: { email: string; branchId: string; label: string }[] = [
  { email: "nihal.gedikli@niluferacar.com.tr", branchId: "evka3", label: "Evka 3" },
  { email: "ezgi.guclu@niluferacar.com.tr", branchId: "erzene", label: "Erzene" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  console.log("[hedef]", classifyDatabaseTarget(process.env.DATABASE_URL).safeLabel);
  try {
    assertTestDatabaseTarget(process.env.DATABASE_URL);
  } catch (error) {
    console.error("[HATA]", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const { getPrisma } = await import("../src/lib/db");
  const prisma = getPrisma();

  for (const target of DEFAULTS) {
    const user = await prisma.user.findFirst({
      where: { email: target.email, deletedAt: null },
      select: { id: true, tenantId: true, email: true, role: true },
    });
    if (!user) {
      console.warn(`[ATLANDI] ${target.email} — kullanıcı bulunamadı.`);
      continue;
    }
    const branch = await prisma.branch.findFirst({
      where: { id: target.branchId, tenantId: user.tenantId },
      select: { id: true, shortName: true },
    });
    if (!branch) {
      console.warn(`[ATLANDI] ${target.email} — "${target.branchId}" şubesi bu kurumda yok.`);
      continue;
    }

    const prev = await getUserPreferences(user.id, user.tenantId);
    const current = prev.dashboard?.defaultBranchId;
    if (current === branch.id) {
      console.log(`[DEĞİŞİKLİK YOK] ${user.email} zaten ${branch.shortName}.`);
      continue;
    }
    if (current) {
      // Kullanıcı kendi tercihini yapmışsa EZİLMEZ — bu script yalnız İLK değeri koyar.
      console.log(`[KORUNDU] ${user.email} kendi tercihini yapmış (${current}); dokunulmadı.`);
      continue;
    }

    if (!apply) {
      console.log(`[KURU] ${user.email} → ${branch.shortName} (${branch.id}) yazılacak.`);
      continue;
    }
    await saveUserPreferences(user.id, user.tenantId, {
      dashboard: { ...(prev.dashboard ?? {}), defaultBranchId: branch.id },
    });
    console.log(`[YAZILDI] ${user.email} → ${branch.shortName} (${branch.id})`);
  }

  if (!apply) console.log("\nHiçbir şey yazılmadı. Uygulamak için: --apply");
}

void main();
