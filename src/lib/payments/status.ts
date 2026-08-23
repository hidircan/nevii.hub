import type { PaymentStatus } from "../types";

/** Integer kuruş/TL tutarları — float kullanma. */
export function remainingAmount(amount: number, paidAmount: number): number {
  return Math.max(0, Math.trunc(amount) - Math.trunc(paidAmount));
}

export function resolveCollectionStatus(input: {
  amount: number;
  paidAmount: number;
  dueDate: string;
  now?: Date;
  voided?: boolean;
}): PaymentStatus {
  if (input.voided) return "voided";
  const paid = Math.trunc(input.paidAmount);
  const amount = Math.trunc(input.amount);
  if (paid <= 0) {
    const due = new Date(input.dueDate);
    if (!Number.isNaN(due.getTime()) && due.getTime() < (input.now ?? new Date()).getTime()) {
      return "overdue";
    }
    return "pending";
  }
  if (paid < amount) return "partial";
  return "paid";
}
