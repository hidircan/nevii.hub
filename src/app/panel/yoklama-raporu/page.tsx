import { redirect } from "next/navigation";
import { getAttendanceReportTool } from "@/lib/services";
import { readData } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { Badge, Card, Input, Label, PageHeader, Select, StatCard } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  attended: "Geldi",
  processed: "İşlendi",
  makeup: "Telafi",
  absent: "Gelmedi",
  excused: "Mazeretli",
  cancelled: "İptal",
  planned: "Planlandı",
};

const STATUS_BADGE: Record<string, string> = {
  attended: "completed",
  processed: "pending",
  makeup: "makeup",
  absent: "absent",
  excused: "late",
  cancelled: "cancelled",
  planned: "scheduled",
};

/**
 * P0-2C — Yönetici Yoklama Raporu. Yalnız SCHOOL_ADMIN/SUPER_ADMIN görebilir
 * (öğretmen/öğrenci/veli asla) — hem burada hem `getAttendanceReportTool`
 * içinde (defense-in-depth) kontrol edilir. Hesaplama TAMAMEN tool
 * katmanında (`attendance-report.ts`), bu sayfa yalnız filtre formu + render.
 */
export default async function AttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    datePreset?: string;
    from?: string;
    to?: string;
    studentId?: string;
    teacherId?: string;
    branchId?: string;
    instrument?: string;
    roomId?: string;
    status?: string;
  }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/yoklama-raporu");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const sp = await searchParams;
  const datePreset = (sp.datePreset as "today" | "this_week" | "this_month" | "custom") || "this_month";

  const [result, data] = await Promise.all([
    getAttendanceReportTool(session, {
      datePreset,
      from: sp.from,
      to: sp.to,
      studentId: sp.studentId || undefined,
      teacherId: sp.teacherId || undefined,
      branchId: sp.branchId || undefined,
      instrument: sp.instrument || undefined,
      roomId: sp.roomId || undefined,
      status: (sp.status as never) || undefined,
    }),
    readData(),
  ]);

  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Yoklama Raporu" />
        <Card>
          <p className="text-sm text-rose-700" role="alert">
            {result.error.message}
          </p>
        </Card>
      </div>
    );
  }

  const { range, summary, rows } = result.data;
  const teachers = [...data.teachers].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const students = [...data.students].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const instruments = Array.from(new Set(data.lessons.map((l) => l.instrument))).sort((a, b) =>
    a.localeCompare(b, "tr")
  );
  const rooms = [...data.rooms].sort((a, b) => a.name.localeCompare(b.name, "tr"));

  return (
    <div>
      <PageHeader
        title="Yoklama Raporu"
        description={`${range.from} — ${range.to} arası, tenant kapsamında.`}
      />

      <Card className="mb-6">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Tarih aralığı</Label>
            <Select name="datePreset" defaultValue={datePreset}>
              <option value="today">Bugün</option>
              <option value="this_week">Bu hafta</option>
              <option value="this_month">Bu ay</option>
              <option value="custom">Özel aralık</option>
            </Select>
          </div>
          <div>
            <Label>Başlangıç (özel aralık)</Label>
            <Input type="date" name="from" defaultValue={sp.from ?? ""} />
          </div>
          <div>
            <Label>Bitiş (özel aralık)</Label>
            <Input type="date" name="to" defaultValue={sp.to ?? ""} />
          </div>
          <div>
            <Label>Durum</Label>
            <Select name="status" defaultValue={sp.status ?? ""}>
              <option value="">Tümü</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Öğrenci</Label>
            <Select name="studentId" defaultValue={sp.studentId ?? ""}>
              <option value="">Tümü</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Öğretmen</Label>
            <Select name="teacherId" defaultValue={sp.teacherId ?? ""}>
              <option value="">Tümü</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Şube</Label>
            <Select name="branchId" defaultValue={sp.branchId ?? ""}>
              <option value="">Tümü</option>
              {data.settings.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.shortName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Enstrüman</Label>
            <Select name="instrument" defaultValue={sp.instrument ?? ""}>
              <option value="">Tümü</option>
              {instruments.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Oda</Label>
            <Select name="roomId" defaultValue={sp.roomId ?? ""}>
              <option value="">Tümü</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-full flex items-center gap-2">
            <button
              type="submit"
              className="rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
            >
              Filtrele
            </button>
            <a
              href="/panel/yoklama-raporu"
              className="rounded-xl border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
            >
              Temizle
            </a>
          </div>
        </form>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard label="Planlanan" value={summary.totalPlanned} />
        <StatCard label="Geldi" value={summary.attended} />
        <StatCard label="Gelmedi" value={summary.absent} />
        <StatCard label="Mazeretli" value={summary.excused} />
        <StatCard label="İşlendi" value={summary.processed} />
        <StatCard label="Telafi" value={summary.makeup} />
        <StatCard label="İptal" value={summary.cancelled} />
        <StatCard label="Riskli öğrenci" value={summary.riskyStudentCount} accent="warning" />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-3">Tarih/Saat</th>
              <th className="px-4 py-3">Öğrenci</th>
              <th className="px-4 py-3">Öğretmen</th>
              <th className="px-4 py-3">Şube</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">Gerekçe</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  Henüz bu filtrelere uygun yoklama kaydı bulunmuyor.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.lessonId} className="border-b border-[var(--color-border)] align-top">
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{formatDateTime(r.startAt)}</td>
                  <td className="px-4 py-2.5 font-medium text-[var(--color-text)]">{r.studentName}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text)]">{r.teacherName}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{r.branchName ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <Badge status={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                    {r.processedReason ?? r.makeupReason ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.studentAtRisk ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                        Riskli
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/panel/ogrenciler/${r.studentId}`}
                      className="text-xs font-medium text-cyan-700 hover:underline"
                    >
                      Öğrenciye git →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
