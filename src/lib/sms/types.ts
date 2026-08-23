export type SmsSendInput = {
  toE164: string;
  body: string;
  idempotencyKey?: string;
};

export type SmsSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
};

export type SmsDeliveryStatus = "queued" | "sent" | "delivered" | "failed" | "undelivered";

export type SmsInbound = {
  fromE164: string;
  text: string;
  providerMessageId?: string;
};

export interface SmsTransport {
  name: string;
  send(input: SmsSendInput): Promise<SmsSendResult>;
}
