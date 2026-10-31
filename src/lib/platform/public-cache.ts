import { revalidateTag, unstable_cache } from "next/cache";
import { getSettingOverride } from "./store";

/**
 * Herkese açık sayfaların ayar okuması: ziyaretçi sayısı veritabanı yükünü artırmaz.
 * Kayıt anında `invalidatePublicSite` (tek çağrı noktası: `recordPublishedVersion`)
 * önbelleği temizler; değişiklik hemen yayındadır. Finans/checkout bu önbelleği KULLANMAZ.
 */
const TAG = "public-site";
export const PUBLIC_REVALIDATE_SECONDS = 3600;

const readCached = unstable_cache(
  async (key: string) => (await getSettingOverride("platform", "*", key))?.value ?? null,
  ["public-setting"],
  { tags: [TAG], revalidate: PUBLIC_REVALIDATE_SECONDS }
);

export async function readPublicSetting(key: string): Promise<unknown> {
  // Next çalışma ortamı dışında (test, script) unstable_cache hata verir: doğrudan okunur.
  return readCached(key).catch(async () => (await getSettingOverride("platform", "*", key))?.value ?? null);
}

/** Başka modüllerin (ör. paket kartları) aynı etiketle önbelleğe alması için. */
export function cachePublic<A extends unknown[], R>(fn: (...args: A) => Promise<R>, name: string) {
  const cached = unstable_cache(fn, [name], { tags: [TAG], revalidate: PUBLIC_REVALIDATE_SECONDS });
  return (...args: A): Promise<R> => cached(...args).catch(() => fn(...args));
}

export function invalidatePublicSite() {
  try {
    revalidateTag(TAG, { expire: 0 });
  } catch {
    // Next çalışma ortamı dışında önbellek de yok.
  }
}
