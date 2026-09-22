import { Badge, Card, EmptyState } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/utils";
import type { TeacherPerformanceReportV2 } from "@/lib/teacher-performance-v2";
import { TEACHER_PERFORMANCE_V2_SCORE_VERSION } from "@/lib/teacher-performance-v2";

/** Server-rendered — tarih filtresi düz `<form method="get">` ile URL search parametrelerini günceller, client fetch yok. */
export function TeacherPerformanceV2Dashboard({
  teacherId,
  periodStart,
  periodEnd,
  report,
}: {
  teacherId: string;
  periodStart: string;
  periodEnd: string;
  report: TeacherPerformanceReportV2;
}) {
  const { components } = report;

  return (
    <div>
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Başlangıç</label>
          <input
            type="date"
            name="periodStart"
            defaultValue={periodStart}
            className="mt-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)]"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Bitiş</label>
          <input
            type="date"
            name="periodEnd"
            defaultValue={periodEnd}
            className="mt-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)]"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          Filtrele
        </button>
        <span className="text-xs text-[var(--color-text-muted)]">
          Varsayılan: son 30 gün · URL ile paylaşılabilir
        </span>
      </form>

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Toplam Performans Skoru</p>
            <p className="text-3xl font-bold text-[var(--color-text)]">
              {report.score !== null ? report.score : "—"}
              {report.score !== null ? <span className="text-base font-normal text-[var(--color-text-muted)]"> / 100</span> : null}
            </p>
            {report.score === null ? (
              <p className="mt-1 text-sm text-amber-600">Yetersiz veri — bu dönemde hiçbir bileşen için veri yok.</p>
            ) : null}
          </div>
          <div className="text-right text-xs text-[var(--color-text-muted)]">
            <p>Formül sürümü: <span className="font-mono">{TEACHER_PERFORMANCE_V2_SCORE_VERSION}</span></p>
            <p>Dönem: {formatDate(periodStart)} – {formatDate(periodEnd)}</p>
            <p>Rapor her görüntülemede güncel veriyle hesaplanır (dondurulmuş anlık görüntü değildir).</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AttendanceCard c={components.attendance} teacherId={teacherId} />
        <FeedbackCard c={components.feedback} />
        <TasksCard c={components.tasks} />
        <HomeworkCard c={components.homework} />
      </div>
    </div>
  );
}

function ComponentHeader({
  title,
  weightPercent,
  c,
  anchor,
}: {
  title: string;
  weightPercent: number;
  c: { hasData: boolean; normalizedValue: number | null; contribution: number | null };
  anchor: string;
}) {
  return (
    <div className="mb-2 flex items-start justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
        <p className="text-[11px] text-[var(--color-text-muted)]">Ağırlık: %{weightPercent}</p>
      </div>
      <div className="text-right">
        <p className="text-lg font-bold text-[var(--color-text)]">
          {c.hasData && c.normalizedValue !== null ? Math.round(c.normalizedValue) : "—"}
        </p>
        <a href={`#${anchor}`} className="text-[11px] font-medium text-[var(--color-primary)] hover:underline">
          Skora katkı: {c.hasData && c.contribution !== null ? `+${c.contribution}` : "veri yok"}
        </a>
      </div>
    </div>
  );
}

function AttendanceCard({ c, teacherId }: { c: TeacherPerformanceReportV2["components"]["attendance"]; teacherId: string }) {
  const flagged = c.rows.filter((r) => r.status === "gelmedi" || r.status === "mazeretli");
  return (
    <Card id="detay-yoklama">
      <ComponentHeader title="Öğretmen Yoklaması" weightPercent={30} c={c} anchor="detay-yoklama" />
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        Yalnızca öğretmenin kendi ders katılımı sayılır; öğrenci devamsızlığı bu skoru asla etkilemez. İptal edilen dersler hariç tutulur.
      </p>
      <div className="mb-3 grid grid-cols-4 gap-2 text-center text-xs">
        <Stat label="Geldi" value={c.attendedCount} />
        <Stat label="Gelmedi" value={c.absentCount} />
        <Stat label="Mazeretli" value={c.excusedCount} />
        <Stat label="Bekliyor" value={c.pendingCount} />
      </div>
      {c.rows.length === 0 ? (
        <EmptyState title="Bu dönemde ders kaydı yok" />
      ) : (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-[var(--color-primary)]">
            Ders detayları ({c.rows.length}) {flagged.length > 0 ? <Badge status="cancelled">{flagged.length} sorunlu</Badge> : null}
          </summary>
          <div className="mt-2 max-h-96 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="text-[var(--color-text-muted)]">
                  <th className="pb-1 pr-2">Tarih</th>
                  <th className="pb-1 pr-2">Saat</th>
                  <th className="pb-1 pr-2">Öğrenci</th>
                  <th className="pb-1 pr-2">Enstrüman</th>
                  <th className="pb-1 pr-2">Durum</th>
                  <th className="pb-1 pr-2">İşaretleyen</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.lessonId} className="border-t border-[var(--color-border)]">
                    <td className="py-1 pr-2">{formatDate(r.startAt)}</td>
                    <td className="py-1 pr-2">{formatTime(r.startAt)}–{formatTime(r.endAt)}</td>
                    <td className="py-1 pr-2">{r.studentName}</td>
                    <td className="py-1 pr-2">{r.instrument}</td>
                    <td className="py-1 pr-2">
                      <Badge status={r.status === "geldi" ? "confirmed" : r.status === "bekliyor" ? "pending" : "cancelled"}>
                        {r.status === "bekliyor" ? "Bekliyor" : r.status}
                      </Badge>
                    </td>
                    <td className="py-1 pr-2 text-[var(--color-text-muted)]">
                      {r.markedAt ? formatDate(r.markedAt) : "—"}
                      {r.note ? ` · ${r.note}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <a href={`/panel/ogretmenler/${teacherId}/program`} className="mt-3 inline-block text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
        Ders programını öğretmen detayında gör →
      </a>
    </Card>
  );
}

function FeedbackCard({ c }: { c: TeacherPerformanceReportV2["components"]["feedback"] }) {
  return (
    <Card id="detay-geri-bildirim">
      <ComponentHeader title="Öğrenci/Veli Değerlendirmesi" weightPercent={25} c={c} anchor="detay-geri-bildirim" />
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        1–5 ölçekli kriter ortalamaları 0–100&apos;e taşınır. Anonimlik eşiği (en az 3 yanıt) sağlanmadan detay gösterilmez.
      </p>
      {!c.eligible ? (
        <EmptyState title="Anonimlik için yeterli yanıt yok" description={`Bu dönemde ${c.responseCount} yanıt var (gereken: en az 3).`} />
      ) : (
        <>
          <p className="mb-2 text-xs text-[var(--color-text-muted)]">Yanıt sayısı: {c.responseCount}</p>
          <div className="mb-3 space-y-1.5 text-xs">
            {c.criteriaAverages
              ? Object.entries(c.criteriaAverages).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="text-[var(--color-text)]">{criterionLabel(key)}</span>
                    <span className="font-medium text-[var(--color-text)]">
                      {value} / 5 <span className="text-[var(--color-text-muted)]">({Math.round(((value - 1) / 4) * 100)}/100)</span>
                    </span>
                  </div>
                ))
              : null}
          </div>
          {c.sharedComments.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-xs font-medium text-[var(--color-primary)]">
                Paylaşılan yorumlar ({c.sharedComments.length})
              </summary>
              <ul className="mt-2 space-y-1.5 text-xs text-[var(--color-text-muted)]">
                {c.sharedComments.map((comment, i) => (
                  <li key={i} className="rounded-md bg-[var(--color-surface-muted)] p-2">
                    {comment}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">Yönetimin paylaşmayı seçtiği yorum yok — yorumlar kimliksiz gösterilir.</p>
          )}
        </>
      )}
    </Card>
  );
}

function criterionLabel(key: string): string {
  const labels: Record<string, string> = {
    clarity: "Dersi anlaşılır anlatma",
    communication: "İletişim ve saygı",
    effectiveness: "Ders verimliliği",
    motivation: "Öğrenciyi motive etme",
    punctuality: "Ders düzeni / zamanında başlama",
  };
  return labels[key] ?? key;
}

function TasksCard({ c }: { c: TeacherPerformanceReportV2["components"]["tasks"] }) {
  return (
    <Card id="detay-is-takip">
      <ComponentHeader title="İş Takip Tamamlama" weightPercent={20} c={c} anchor="detay-is-takip" />
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        Yalnızca bu öğretmene atanmış görevler. Son tarihi varsa zamanında tamamlama önceliklidir; yoksa tamamlanma oranı kullanılır.
      </p>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="Toplam" value={c.totalAssigned} />
        <Stat label="Tamamlanan" value={c.completedCount} />
        <Stat label="Açık" value={c.openCount} />
        <Stat label="Gecikmiş" value={c.overdueCount} highlight={c.overdueCount > 0} />
        <Stat label="Zamanında" value={c.onTimeCount} />
        <Stat label="Tamamlanma %" value={c.completionRate !== null ? Math.round(c.completionRate * 100) : "—"} />
      </div>
      {c.rows.length === 0 ? (
        <EmptyState title="Bu dönemde atanmış görev yok" description="Görev yokluğu skoru düşürmez." />
      ) : (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-[var(--color-primary)]">Görev detayları ({c.rows.length})</summary>
          <div className="mt-2 max-h-96 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead>
                <tr className="text-[var(--color-text-muted)]">
                  <th className="pb-1 pr-2">Başlık</th>
                  <th className="pb-1 pr-2">Kategori</th>
                  <th className="pb-1 pr-2">Öncelik</th>
                  <th className="pb-1 pr-2">Son tarih</th>
                  <th className="pb-1 pr-2">Durum</th>
                  <th className="pb-1 pr-2">Tamamlanma</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.taskId} className="border-t border-[var(--color-border)]">
                    <td className="py-1 pr-2">{r.title}</td>
                    <td className="py-1 pr-2">{r.category}</td>
                    <td className="py-1 pr-2">{r.priority}</td>
                    <td className="py-1 pr-2">{r.dueDate ? formatDate(r.dueDate) : "—"}</td>
                    <td className="py-1 pr-2">
                      {r.overdue ? <Badge status="cancelled">Gecikmiş</Badge> : <Badge status={r.status === "COMPLETED" ? "confirmed" : "pending"}>{r.status}</Badge>}
                    </td>
                    <td className="py-1 pr-2">{r.completedAt ? formatDate(r.completedAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Card>
  );
}

function HomeworkCard({ c }: { c: TeacherPerformanceReportV2["components"]["homework"] }) {
  const missing = c.rows.filter((r) => !r.homeworkGiven);
  return (
    <Card id="detay-odev">
      <ComponentHeader title="Ders Sonrası Ödev Verme" weightPercent={25} c={c} anchor="detay-odev" />
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        Yalnızca iptal edilmemiş, geçmişte kalmış ve geldi/işlendi kabul edilen dersler sayılır. Öğrencinin gelmemesi bu bileşeni etkilemez.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2 text-center text-xs">
        <Stat label="Uygun ders" value={c.eligibleLessonCount} />
        <Stat label="Ödev verilen" value={c.assignedCount} />
        <Stat label="Ödev verilmeyen" value={c.notAssignedCount} highlight={c.notAssignedCount > 0} />
        <Stat label="Öğrenci teslimi" value={c.submittedCount} />
        <Stat label="İncelenen teslim" value={c.reviewedCount} />
        <Stat label="Atama %" value={c.rawValue !== null ? Math.round(c.rawValue * 100) : "—"} />
      </div>
      {c.rows.length === 0 ? (
        <EmptyState title="Bu dönemde uygun ders yok" description="Ders yokluğu skoru düşürmez." />
      ) : (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-[var(--color-primary)]">
            Ders detayları ({c.rows.length}) {missing.length > 0 ? <Badge status="cancelled">{missing.length} ödev verilmedi</Badge> : null}
          </summary>
          <div className="mt-2 max-h-96 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="text-[var(--color-text-muted)]">
                  <th className="pb-1 pr-2">Tarih</th>
                  <th className="pb-1 pr-2">Öğrenci</th>
                  <th className="pb-1 pr-2">Enstrüman</th>
                  <th className="pb-1 pr-2">Ödev</th>
                  <th className="pb-1 pr-2">Son teslim</th>
                  <th className="pb-1 pr-2">Teslim edildi mi</th>
                  <th className="pb-1 pr-2">İncelendi mi</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.lessonId} className="border-t border-[var(--color-border)]">
                    <td className="py-1 pr-2">{formatDate(r.startAt)}</td>
                    <td className="py-1 pr-2">{r.studentName}</td>
                    <td className="py-1 pr-2">{r.instrument}</td>
                    <td className="py-1 pr-2">
                      {r.homeworkGiven ? (
                        r.homeworkTitle
                      ) : (
                        <Badge status="cancelled">Ödev verilmedi</Badge>
                      )}
                    </td>
                    <td className="py-1 pr-2">{r.homeworkDueDate ? formatDate(r.homeworkDueDate) : "—"}</td>
                    <td className="py-1 pr-2">{r.studentSubmitted ? "Evet" : "Hayır"}</td>
                    <td className="py-1 pr-2">{r.teacherReviewed ? "Evet" : "Hayır"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`rounded-md p-2 ${highlight ? "bg-rose-50 dark:bg-rose-950/30" : "bg-[var(--color-surface-muted)]"}`}>
      <p className={`text-sm font-semibold ${highlight ? "text-rose-600" : "text-[var(--color-text)]"}`}>{value}</p>
      <p className="text-[10px] text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}
