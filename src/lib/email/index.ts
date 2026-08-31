export type { EmailSendInput, EmailSendResult, EmailTransport } from "./types";
export { getEmailConfig, getEmailProviderName, isEmailProviderConfigured, getAppBaseUrl, getMobileAppLinks } from "./config";
export { getEmailTransport, setEmailTransportForTests } from "./transport";

import { getEmailTransport } from "./transport";
import type { EmailSendInput, EmailSendResult } from "./types";

/** Tek gönderim noktası — konfigüre değilse ASLA sahte başarı döndürmez (bkz. transport.ts consoleTransport). */
export async function sendEmail(input: EmailSendInput): Promise<EmailSendResult> {
  return getEmailTransport().send(input);
}
