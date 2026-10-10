/**
 * Telafi geçmişi (sonuçlanan talepler) — filtre + sıralama. Saf; istemci tablosu ve test ortak.
 */
export type MakeupHistoryRow = {
  id: string;
  studentName: string;
  instrument: string;
  status: string;
  lessonLabel: string;
  slaLabel: string;
  slaBreached: boolean;
  decisionNote: string;
  /** ISO — karar anı; yoksa boş. Tarih filtresi ve sıralama bunu kullanır. */
  decidedAt: string;
  decidedAtLabel: string;
  /** İşlemi yapan kişinin ad soyadı (ham kullanıcı kimliği değil). */
  actorName: string;
};

export type MakeupHistoryFilter = { query: string; status: string; actor: string; from: string; to: string };

export function filterMakeupHistory(rows: MakeupHistoryRow[], f: MakeupHistoryFilter): MakeupHistoryRow[] {
  const q = f.query.trim().toLocaleLowerCase("tr");
  return rows
    .filter((r) => {
      if (f.status !== "all" && r.status !== f.status) return false;
      if (f.actor !== "all" && r.actorName !== f.actor) return false;
      const day = r.decidedAt.slice(0, 10);
      if (f.from && (!day || day < f.from)) return false;
      if (f.to && (!day || day > f.to)) return false;
      if (q && !`${r.studentName} ${r.instrument} ${r.decisionNote} ${r.actorName}`.toLocaleLowerCase("tr").includes(q)) return false;
      return true;
    })
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
}
