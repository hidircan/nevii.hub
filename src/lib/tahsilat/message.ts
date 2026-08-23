import { formatMoney } from "../utils";
import { estimateSmsSegments } from "../sms";

export type CollectionsDraftInput = {
  studentName?: string;
  parentName?: string;
  remaining: number;
  paymentStatus?: string;
  schoolName?: string;
};

export function buildDeterministicCollectionsDraft(input: CollectionsDraftInput): string {
  const parent = input.parentName?.trim() || "Değerli velimiz";
  const student = input.studentName?.trim() || "öğrencimiz";
  const kind =
    input.paymentStatus === "overdue" ? "gecikmiş" : input.paymentStatus === "partial" ? "kısmi kalan" : "bekleyen";
  const school = input.schoolName?.trim() ? ` ${input.schoolName.trim()}` : "";
  return (
    `Merhaba ${parent}, ${student} için ${formatMoney(input.remaining)} tutarında ${kind} ödeme kaydı bulunmaktadır.` +
    ` Uygun bir zamanda tamamlarsanız seviniriz.${school ? ` (${school.trim()})` : ""} Sorularınız için bize ulaşabilirsiniz.`
  );
}

export function sanitizeCollectionsMessage(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 600);
}

export function describeMessageFit(text: string): {
  chars: number;
  smsSegments: number;
  smsEncoding: "gsm7" | "ucs2";
  whatsappOk: boolean;
} {
  const segs = estimateSmsSegments(text);
  return {
    chars: segs.chars,
    smsSegments: segs.segments,
    smsEncoding: segs.encoding,
    whatsappOk: segs.chars <= 1600,
  };
}
