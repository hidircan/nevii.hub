import { useApiGet } from "../hooks/use-api";
import type { MakeupResponse, PaymentReceiptResponse } from "../types/api";

/**
 * Mobil uç yolları — tek kaynak. Hiçbiri kapsam parametresi (tenantId,
 * teacherId, studentId) almaz: kapsam sunucuda oturumdan çözülür.
 */
export const MOBILE_ENDPOINTS = {
  session: "/api/v1/mobile/session",
  makeup: "/api/v1/makeup",
  paymentReceipt: (paymentId: string) => `/api/v1/payments/${encodeURIComponent(paymentId)}/receipt`,
} as const;

/** Oturumun telafi kayıtları (öğretmen: kendi; öğrenci/veli: bağlı öğrenci). Hata `code` ErrorState'e verilir. */
export function useMakeupRequests() {
  return useApiGet<MakeupResponse>(MOBILE_ENDPOINTS.makeup);
}

/** Makbuz — `eligible:false` ise `ineligibleReason` gösterilir; 403/404 ErrorState ile. */
export function usePaymentReceipt(paymentId: string | undefined) {
  return useApiGet<PaymentReceiptResponse>(paymentId ? MOBILE_ENDPOINTS.paymentReceipt(paymentId) : "");
}
