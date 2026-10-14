import { lookup, type Locale } from "../../i18n/locales";
import { getActiveLocale } from "../../i18n/locale-store";

/**
 * Bildirim kategori görüntüleme etiketleri — kategori kataloğu backend'de tek
 * kaynak (`src/lib/notification-categories.ts`); sunucu zaten yalnızca
 * implemented=true kategorileri döndürür. Bilinmeyen kategori kodu olduğu
 * gibi gösterilir (uydurma yok). React Native'siz saf modül — testlerden
 * doğrudan import edilebilir.
 */
export function categoryLabel(category: string, locale: Locale = getActiveLocale()): string {
  const hit = lookup(locale, `notifCat.${category}`);
  return hit === `notifCat.${category}` ? category : hit;
}
