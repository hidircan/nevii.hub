"use client";

import { useEffect } from "react";
import { clearCheckoutSession } from "@/components/billing/checkout-session";

/**
 * Ödeme doğrulandıktan sonra sekme-oturumunu temizler: token/taslak/anahtar
 * silinir, sonraki satın alma temiz başlar. Yalnız `paid` durumunda render edilir.
 */
export function ClearCheckoutOnPaid({ active }: { active: boolean }) {
  useEffect(() => {
    if (active) clearCheckoutSession();
  }, [active]);
  return null;
}
