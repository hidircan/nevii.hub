import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { Badge, Card, PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { listTasksTool } from "@/lib/services";
import { groupTasksForCalendarMonth, isTaskOverdue } from "@/lib/task-calendar";
import { ATTENDANCE_CALENDAR_COLORS } from "@/lib/attendance-calendar";

export const dynamic = "force-dynamic";

const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function parseMonthParam(raw: string | undefined): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (m! >= 1 && m! <= 12) return { year: y!, month: m! };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * İş Takip takvim görünümü (admin) — Faz 2 madde 2. Görevleri son
 * tarihlerine göre bir ay ızgarasında gösterir; tarihsiz görevler ayrı bir
 * bölümde (hiçbir günde kaybolmazlar), gecikmiş görevler kırmızı vurgulu.
 * `attendance-calendar.ts`'nin renk sabitlerini (ATTENDANCE_CALENDAR_COLORS)
 * yeniden kullanır — dönem/akademik yıl kavramına bağlı olmadığı için o
 * bileşenin kendisi kopyalanmaz, yalnızca ortak renk dili paylaşılır.
 */
export default async function IsTakipTakvimPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/is-takip/takvim");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const kurum = await getInstitutionContext(session);
  const sp = await searchParams;
  const { year, month } = parseMonthParam(sp.month);
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  const listRes = await listTasksTool(session, {});
  const tasks = listRes.ok ? listRes.data.tasks.filter((t) => t.status !== "ARCHIVED") : [];
  const { days, undated } = groupTasksForCalendarMonth(tasks, year, month);
  const todayYmd = new Date().toISOString().slice(0, 10);

  const leadingBlanks = new Date(year, month - 1, 1).getDay(); // 0=Pazar

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref="/panel/is-takip/kanban" label="İş Takip'e dön" className="mb-3" />
      <PageHeader
        title="İş Takip — Takvim"
        actions={
          <Link href="/panel/is-takip/liste" className="text-sm font-medium text-[var(--color-primary)] hover:underline">
            Liste görünümü
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Link
          href={`/panel/is-takip/takvim?month=${prev.year}-${String(prev.month).padStart(2, "0")}`}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--color-bg)]"
        >
          ← Önceki
        </Link>
        <span className="rounded-md bg-[var(--color-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text)]">
          {MONTH_LABELS[month - 1]} {year}
        </span>
        <Link
          href={`/panel/is-takip/takvim?month=${next.year}-${String(next.month).padStart(2, "0")}`}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--color-bg)]"
        >
          Sonraki →
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cts"].map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-[var(--color-text-muted)]">
            {d}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((day) => {
          const dayNum = Number(day.date.slice(8, 10));
          const hasOverdue = day.tasks.some((t) => isTaskOverdue(t, todayYmd));
          const isToday = day.date === todayYmd;
          return (
            <div
              key={day.date}
              className="min-h-[84px] rounded-md border p-1.5 text-left"
              style={{
                borderColor: hasOverdue ? ATTENDANCE_CALENDAR_COLORS.processed : "var(--color-border)",
                backgroundColor: isToday ? ATTENDANCE_CALENDAR_COLORS.planned + "22" : "var(--color-surface)",
              }}
            >
              <p className="text-xs font-semibold text-[var(--color-text-muted)]">{dayNum}</p>
              <div className="mt-1 space-y-0.5">
                {day.tasks.slice(0, 3).map((t) => (
                  <Link
                    key={t.id}
                    href={`/panel/is-takip/${t.id}`}
                    className="block truncate rounded px-1 py-0.5 text-[10px] font-medium text-white hover:opacity-90"
                    style={{
                      backgroundColor: isTaskOverdue(t, todayYmd)
                        ? ATTENDANCE_CALENDAR_COLORS.processed
                        : ATTENDANCE_CALENDAR_COLORS.attended,
                    }}
                    title={t.title}
                  >
                    {t.title}
                  </Link>
                ))}
                {day.tasks.length > 3 ? (
                  <p className="text-[10px] text-[var(--color-text-muted)]">+{day.tasks.length - 3} daha</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Tarihsiz Görevler ({undated.length})</h2>
        {undated.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">Tarihsiz görev yok.</p>
        ) : (
          <div className="space-y-2">
            {undated.map((t) => (
              <Link key={t.id} href={`/panel/is-takip/${t.id}`}>
                <Card className="!p-3 transition hover:border-[var(--color-primary)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--color-text)]">{t.title}</p>
                    <Badge status="pending">{t.category}</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
