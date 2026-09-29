import { listInstrumentCatalogTool } from "./services";
import type { ServiceContext } from "./services/context";

/** Katalog okunamazsa (ör. yetki) güvenli yedek liste. */
const FALLBACK_INSTRUMENTS = ["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan", "Elektro Gitar", "Bağlama"];

/**
 * Formlarda seçilebilen enstrümanlar — TEK kaynak: kurumun enstrüman kataloğundaki aktif kayıtlar
 * (yeni öğrenci + deneme dersi aynı listeyi gösterir).
 */
export async function activeInstrumentOptions(ctx: ServiceContext): Promise<string[]> {
  const res = await listInstrumentCatalogTool(ctx, {});
  return res.ok ? res.data.entries.filter((e) => e.status === "active").map((e) => e.name) : FALLBACK_INSTRUMENTS;
}
