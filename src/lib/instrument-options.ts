import { resolveActiveInstrumentNames } from "./instrument-catalog";
import type { ServiceContext } from "./services/context";

/**
 * Formlarda seçilebilen enstrümanlar — TEK kaynak: kurumun enstrüman kataloğundaki AKTİF kayıtlar
 * (Kurulum Merkezi › Enstrümanlar). Kurum yalnız oturumdan gelir.
 *
 * KÖK NEDEN (2026-10-03, "Bas Gitar oda oluşturmada yok"): formlar sabit `INSTRUMENTS` (8 ad) listesini
 * ya da katalog okunamayınca (ör. şube müdürü katalog aracına yetkisiz) aynı sabit yedeği gösteriyordu;
 * katalogda tanımlı Bas Gitar/Ukulele vb. görünmüyordu. Artık yedek liste yok.
 */
export async function activeInstrumentOptions(ctx: Pick<ServiceContext, "tenantId">): Promise<string[]> {
  return resolveActiveInstrumentNames(ctx.tenantId);
}

