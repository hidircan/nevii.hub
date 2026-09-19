/**
 * 2026-09-19 — sözleşme ekranındaki tarih kavramlarının çelişki uyarıları.
 * Kurum esnek çalışır (ders kayıttan önce başlayabilir, sözleşme ilk dersten
 * sonra yapılabilir); bu yüzden hiçbir uyarı ENGEL değildir — riskli durum
 * görünür kılınır, kullanıcı düzeltebilir. Saf fonksiyon (istemci + test).
 *
 * Kavramlar: kayıt tarihi (öğrencinin sisteme kaydı) · ders başlangıcı (ilk
 * ders) · sözleşme başlangıcı (ücret/taksit hesabının başladığı gün) · ilk
 * tahsilat tarihi (paranın gerçekten alındığı gün) · taksit vadesi (ödemenin
 * beklendiği gün).
 */

export type ContractDateNotice = { level: "info" | "warning"; text: string };

export type ContractDateGuidanceInput = {
  registeredAt?: string;
  lessonStartDay?: string;
  contractStartDay?: string;
  firstPaymentCollectedAt?: string;
  firstDueDate?: string;
  /** yyyy-MM-dd — "bugün" (kurum saatiyle). */
  today: string;
  /** Önizlemedeki taksitler (elle düzenlenmiş vadeler dahil). */
  installments?: { sequence: number; dueDate: string; manual?: boolean }[];
};

const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);
const tr = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`;

export function contractDateGuidance(input: ContractDateGuidanceInput): ContractDateNotice[] {
  const notices: ContractDateNotice[] = [];
  const registered = day(input.registeredAt);
  const lessonStart = day(input.lessonStartDay);
  const contractStart = day(input.contractStartDay);
  const collected = day(input.firstPaymentCollectedAt);
  const firstDue = day(input.firstDueDate);

  if (registered && lessonStart && lessonStart < registered) {
    notices.push({
      level: "info",
      text: `Ders başlangıcı (${tr(lessonStart)}) kayıt tarihinden (${tr(registered)}) önce. Bu kurum için izinli; sözleşme ve ücret hesabı ders başlangıcına göre yapılır.`,
    });
  }
  if (contractStart && contractStart < input.today) {
    notices.push({
      level: "info",
      text: `Sözleşme başlangıcı (${tr(contractStart)}) geçmişte: sözleşme ilk dersten sonra oluşturuluyor. Bu izinlidir; ödeme planı bu tarihten hesaplanır ve geçmiş aylar da taksit olarak listelenir.`,
    });
  }
  if (collected && contractStart && collected < contractStart) {
    notices.push({
      level: "warning",
      text: `İlk tahsilat tarihi (${tr(collected)}) sözleşme başlangıcından (${tr(contractStart)}) önce. Peşin alındıysa sorun yok; değilse tahsilat tarihini düzeltin.`,
    });
  }
  if (firstDue && contractStart && firstDue < contractStart) {
    notices.push({
      level: "warning",
      text: `İlk taksit vadesi (${tr(firstDue)}) sözleşme başlangıç tarihinden (${tr(contractStart)}) önce seçildi. Vadeyi sözleşme başlangıcına veya sonrasına alın.`,
    });
  }

  const rows = [...(input.installments ?? [])].sort((a, b) => a.sequence - b.sequence);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (!row.manual) continue;
    const due = day(row.dueDate);
    if (!due) continue;
    const prev = i > 0 ? day(rows[i - 1]!.dueDate) : undefined;
    if (prev && due < prev) {
      notices.push({
        level: "warning",
        text: `${row.sequence}. taksitin elle girilen vadesi (${tr(due)}) bir önceki taksitten (${tr(prev)}) önce. Sırayı kontrol edin.`,
      });
    }
    if (contractStart && due < contractStart) {
      notices.push({
        level: "warning",
        text: `${row.sequence}. taksitin elle girilen vadesi (${tr(due)}) sözleşme başlangıcından (${tr(contractStart)}) önce.`,
      });
    }
  }
  return notices;
}
