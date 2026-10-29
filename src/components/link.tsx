import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * Uygulamanın tek Link'i — otomatik önyükleme (prefetch) varsayılan olarak KAPALI.
 *
 * Neden (2026-10-01, Vercel Hobby "Fluid Active CPU %75" uyarısı): kök layout çerez okuduğu için
 * tüm rotalar dinamik ve /panel, /ogretmen, /ogrenci altında `loading.tsx` var. Bu durumda Next.js,
 * ekranda görünen her <Link> için sunucuda layout render'ı yapan bir önyükleme isteği atar. Yerel
 * ölçümde tek bir /panel/ogrenciler açılışı 50 önyükleme isteği üretti ve sayfanın kendisinin ~13
 * katı CPU harcadı. Kapalıyken sayfa yalnız tıklanınca istenir; `loading.tsx` yine gösterilir.
 * Tek bir bağlantıda gerçekten gerekiyorsa `prefetch` açıkça verilebilir. `next/link`'i doğrudan
 * import etmek ESLint ile engellidir (eslint.config.mjs).
 */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
