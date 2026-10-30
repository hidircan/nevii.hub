import { getPlatformBrand } from "@/lib/platform/branding";

/** Platform logosunun tek render noktası — yükseklik sabit, genişlik logonun oranından. */
export async function PlatformLogo({ height, alt = "" }: { height: number; alt?: string }) {
  const brand = await getPlatformBrand();
  return (
    // eslint-disable-next-line @next/next/no-img-element -- runtime ayarı; next/image optimizer'dan geçmez
    <img
      src={brand.logoUrl}
      alt={alt}
      height={height}
      width={Math.round((height * brand.logoWidth) / brand.logoHeight)}
      // Tailwind tabanı `img { height: auto }` der: yükseklik satır içi sabitlenir.
      style={{ height, width: "auto", maxWidth: "none" }}
    />
  );
}
