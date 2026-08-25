/**
 * PRODUCT_BACKLOG §2.1 — tahsilat vade pencereleri.
 * Kredi kartı: ayın 1–5’i; nakit/havale: en geç ayın 20’si.
 */

import type { StudentPaymentMethod, StudentType } from "./types";
import { hasMebStudentType } from "./types";

export type DueWindow = { minDay: number; maxDay: number; label: string };

export function dueWindowForPaymentMethod(method: StudentPaymentMethod | undefined): DueWindow {
  if (method === "credit_card") {
    return { minDay: 1, maxDay: 5, label: "Kredi kartı vadesi: ayın 1–5’i" };
  }
  // cash, transfer, unknown → nakit/havale kuralı
  return { minDay: 1, maxDay: 20, label: "Nakit/havale vadesi: en geç ayın 20’si" };
}

export function isValidDueDay(method: StudentPaymentMethod | undefined, day: number): boolean {
  const w = dueWindowForPaymentMethod(method);
  return Number.isInteger(day) && day >= w.minDay && day <= w.maxDay;
}

/**
 * PRODUCT_BACKLOG §2.2 — MEB → VakıfBank, diğer → Halkbank.
 */
export type BankIbanKey = "vakifbank" | "halkbank";

/**
 * Faz 1B — öğrenci artık birden fazla türe sahip olabilir. Ürün kararı:
 * atanmış türlerden HERHANGİ biri MEB ise VakıfBank kullanılır (MEB'in
 * uyumluluk gereksinimi diğer türlerle birlikte de geçerliliğini korur);
 * aksi halde Halkbank.
 */
export function bankForStudentType(studentTypes: StudentType[]): BankIbanKey {
  return hasMebStudentType(studentTypes) ? "vakifbank" : "halkbank";
}

export function resolveCollectionsIban(
  studentTypes: StudentType[],
  settings: { vakifbankIban?: string; halkbankIban?: string }
): { bank: BankIbanKey; iban: string | undefined; bankLabel: string } {
  const bank = bankForStudentType(studentTypes);
  if (bank === "vakifbank") {
    return { bank, iban: settings.vakifbankIban, bankLabel: "VakıfBank" };
  }
  return { bank, iban: settings.halkbankIban, bankLabel: "Halkbank" };
}
