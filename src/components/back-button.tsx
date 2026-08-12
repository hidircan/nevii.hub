"use client";

/**
 * ÖNCELİK 4 (devam) / İş 5 (bu sprint) — Paneldeki detay/oluşturma/düzenleme
 * ekranları için tek, tekrar kullanılabilir "Geri" bileşeni. Öncelik sırası
 * artık ÜÇ kademeli — "bağlamı koruyan geri navigasyon" (İş 5):
 *
 *   1) `?returnTo=` query param'ı — kullanıcı bu ekrana AÇIKÇA bir bağlamdan
 *      geldiyse (ör. Telafi Merkezi → İş Takip, Öğrenci → Ödeme kaydı) bu
 *      HER ZAMAN kazanır; tarayıcı geçmişi bile bu durumda göz ardı edilir,
 *      çünkü kullanıcının "mantıksal üst bağlamı" tarayıcı geçmişinden daha
 *      güvenilir bir sinyaldir (ör. yeni sekmede açılmış olabilir). Değer
 *      TEK bir doğrulayıcıdan (`resolveSafeReturnTo`, `lib/safe-return-to.ts`)
 *      geçer — allowlist dışı/harici/protokol-göreli/`javascript:` değerler
 *      SESSİZCE reddedilir, `fallbackHref`'e düşülür (open redirect yok).
 *   2) `returnTo` yoksa/geçersizse: tarayıcı geçmişi (`router.back()`) —
 *      yalnızca bu SEKME içinde bu uygulamadan gelen bir önceki girdi varsa
 *      güvenli sayılır (`document.referrer` aynı origin + `window.history.
 *      length > 1` kontrolü).
 *   3) İkisi de yoksa: `fallbackHref`'e (sabit, mantıklı liste ekranı) düz
 *      `Link` ile gider.
 */

import { useCallback, useState, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveSafeReturnTo } from "@/lib/safe-return-to";

/** SSR'da her zaman false (document/window yok); istemcide ilk render'da lazy initializer ile bir kez hesaplanır — effect/setState döngüsü yok. */
function computeCanGoBack(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const sameOriginReferrer = document.referrer && new URL(document.referrer).origin === window.location.origin;
    return Boolean(sameOriginReferrer) && window.history.length > 1;
  } catch {
    return false;
  }
}

export function BackButton({
  fallbackHref,
  label = "Geri",
  /** Formda kaydedilmemiş değişiklik varsa true geçirin — ayrılmadan önce onay ister. */
  hasUnsavedChanges,
  className,
}: {
  fallbackHref: string;
  label?: string;
  hasUnsavedChanges?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [canGoBack] = useState(computeCanGoBack);

  const safeReturnTo = resolveSafeReturnTo(searchParams.get("returnTo"));
  const target = safeReturnTo ?? fallbackHref;

  const confirmLeaveIfDirty = useCallback((): boolean => {
    if (!hasUnsavedChanges) return true;
    return window.confirm("Kaydedilmemiş değişiklikleriniz var. Yine de ayrılmak istiyor musunuz?");
  }, [hasUnsavedChanges]);

  function onClick(e: MouseEvent) {
    if (!confirmLeaveIfDirty()) {
      e.preventDefault();
      return;
    }
    // returnTo varsa bağlamı KORU — tarayıcı geçmişine düşme (bkz. dosya başı notu).
    if (safeReturnTo) return;
    if (canGoBack) {
      e.preventDefault();
      router.back();
    }
    // canGoBack=false ise <Link> zaten fallbackHref'e gidiyor, ek işlem gerekmez.
  }

  return (
    <Link
      href={target}
      onClick={onClick}
      className={cn(
        "-mx-1 -my-1.5 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 py-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
        className
      )}
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  );
}
