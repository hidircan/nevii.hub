import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

/**
 * "Şimdi" değerini render sırasında `Date.now()` çağırmadan (react-hooks/purity
 * bunu yasaklıyor — bkz. MOBILE_PARITY.md'deki ilgili not) güvenli biçimde
 * sağlayan paylaşılan kanca. "Ders/ödev/görev geçmişe düştü mü" gibi
 * göstergeler bu değere göre hesaplanır.
 *
 * Yalnızca mount anında donup kalmasın diye — ve `useApiGet` her ekranda
 * focus'ta yeniden veri çekmediği için (bkz. `useFocusRefetch` kullanılmayan
 * ekranlar) veri tazeliğine bel bağlamadan — bu değer BAĞIMSIZ olarak iki
 * yoldan tazelenir: (1) ekran her focus olduğunda (`useFocusEffect`, aynı
 * `useFocusRefetch`'in kullandığı expo-router ilkel'i), (2) ekran görünürken
 * NOW_REFRESH_INTERVAL_MS'te bir. Saniyelik değil, dakikalık — "geçmiş/
 * gecikmiş" rozetleri için yeterli hassasiyet, gereksiz render maliyeti yok.
 */
const NOW_REFRESH_INTERVAL_MS = 60_000;

export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const id = setInterval(() => setNow(Date.now()), NOW_REFRESH_INTERVAL_MS);
      return () => clearInterval(id);
    }, [])
  );

  return now;
}
