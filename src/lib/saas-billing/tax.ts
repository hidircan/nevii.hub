/**
 * SaaS satış vergisi (KDV) — TEK karar noktası.
 *
 * TİCARİ KARAR: liste fiyatları KDV HARİÇ tutulur, müşteriye "+ KDV" ile
 * gösterilir. Karttan çekilen toplam = müşterinin onayladığı KDV dahil toplam.
 *
 * ORAN POLİTİKASI (uydurma yok):
 * - Gerçek oran SADECE env ile gelir: SAAS_TAX_RATE_BPS (örn. 2000 = %20)
 *   + SAAS_TAX_RATE_VERIFIED=true (mali müşavir/owner doğrulaması).
 * - Doğrulanmamış oranla GERÇEK sağlayıcıda checkout KAPALI (403).
 * - Mock/demo akışta örnek oran (%20) kullanılabilir; HER yüzeyde
 *   "örnek vergi hesabı" diye işaretlenir, snapshot'a taxDemo=true yazılır.
 * - Vergi bilinmiyor diye %0 veya muafiyet varsayılmaz.
 *
 * HESAP: minor-unit, satır bazında yarım yukarı yuvarlama
 * (Math.round). Öğrenci aidatı/eğitim hizmeti vergisine dokunulmaz;
 * bu modül YALNIZ kurumlara SaaS satış içindir.
 */
import { formatMinorTR, type SaasCurrency } from "./types";

/** Örnek vergi oranı (bps). SADECE demo; gerçek oran env + doğrulama ile gelir. */
export const DEMO_TAX_RATE_BPS = 2000;

export type TaxConfig = {
  /** Baz puan (2000 = %20). */
  rateBps: number;
  /** Mali müşavir/owner doğrulaması var mı? */
  verified: boolean;
  /** Örnek (demo) oran mı? */
  demo: boolean;
  /** Görünen oran etiketi: "%20". */
  rateLabel: string;
};

export function formatRateLabel(rateBps: number): string {
  const pct = rateBps / 100;
  return `%${Number.isInteger(pct) ? String(pct) : pct.toFixed(2)}`;
}

export function getTaxConfig(): TaxConfig {
  const verified =
    (process.env.SAAS_TAX_RATE_VERIFIED || "").toLowerCase() === "true" &&
    /^\d+$/.test(process.env.SAAS_TAX_RATE_BPS || "") &&
    Number(process.env.SAAS_TAX_RATE_BPS) >= 0 &&
    Number(process.env.SAAS_TAX_RATE_BPS) <= 10000;
  if (verified) {
    const rateBps = Number(process.env.SAAS_TAX_RATE_BPS);
    return { rateBps, verified: true, demo: false, rateLabel: formatRateLabel(rateBps) };
  }
  return {
    rateBps: DEMO_TAX_RATE_BPS,
    verified: false,
    demo: true,
    rateLabel: formatRateLabel(DEMO_TAX_RATE_BPS),
  };
}

/** KDV hariç tutar gösterimi: "3.000,00 ₺ + KDV". */
export function formatExVat(minor: number, currency: SaasCurrency = "TRY"): string {
  return `${formatMinorTR(minor, currency)} + KDV`;
}

export function applyTax(exclMinor: number, rateBps: number): { taxMinor: number; totalMinor: number } {
  if (!Number.isInteger(exclMinor) || exclMinor < 0) throw new Error("Geçersiz tutar.");
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) throw new Error("Geçersiz vergi oranı.");
  const taxMinor = Math.round((exclMinor * rateBps) / 10000);
  return { taxMinor, totalMinor: exclMinor + taxMinor };
}

export type TaxBreakdown = {
  /** KDV hariç ara toplam (indirim sonrası). */
  exclMinor: number;
  taxMinor: number;
  totalMinor: number;
  rateBps: number;
  rateLabel: string;
  demo: boolean;
  displayExcl: string;
  displayTax: string;
  displayTotal: string;
};

export function taxBreakdown(exclMinor: number, tax: TaxConfig, currency: SaasCurrency = "TRY"): TaxBreakdown {
  const { taxMinor, totalMinor } = applyTax(exclMinor, tax.rateBps);
  return {
    exclMinor,
    taxMinor,
    totalMinor,
    rateBps: tax.rateBps,
    rateLabel: tax.rateLabel,
    demo: tax.demo,
    displayExcl: formatMinorTR(exclMinor, currency),
    displayTax: formatMinorTR(taxMinor, currency),
    displayTotal: formatMinorTR(totalMinor, currency),
  };
}
