/**
 * Satır-içi (inline) e-posta eki — nodemailer `attachments` karşılığı.
 * Kurum logosu gibi görseller, TÜM büyük e-posta istemcilerinde (Gmail,
 * Outlook, Apple Mail) çalışan TEK taşınabilir yol olan CID referansıyla
 * gömülür (`<img src="cid:...">`). `data:` URI'ler Gmail/Outlook'ta
 * engellenir/striptlenir (10. tur iş #2 kök nedeni), harici URL'ler ise
 * "görselleri göster" onayına takılır — CID eki ikisini de çözer.
 */
export type EmailAttachment = {
  /** Her mesajda benzersiz içerik kimliği (örn. "nevii-kurum-logo"). */
  cid: string;
  filename: string;
  contentType: string;
  /** Ham baytların base64 karşılığı (data-URI öneksiz). */
  contentBase64: string;
};

export type EmailSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Varsa `html` içinden `cid:` ile referans verilen satır-içi ekler. */
  attachments?: EmailAttachment[];
};

export type EmailSendResult =
  | { delivered: true; messageId?: string }
  | { delivered: false; blocked: boolean; reason: string };

export type EmailTransport = {
  name: string;
  send(input: EmailSendInput): Promise<EmailSendResult>;
};
