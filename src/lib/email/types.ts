export type EmailSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailSendResult =
  | { delivered: true; messageId?: string }
  | { delivered: false; blocked: boolean; reason: string };

export type EmailTransport = {
  name: string;
  send(input: EmailSendInput): Promise<EmailSendResult>;
};
