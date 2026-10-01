import Link from "@/components/link";
import { getTeacherAttendanceReportTool } from "@/lib/services";
import type { ServiceContext } from "@/lib/services/context";
import { Card, Input, Label, Select } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { withReturnTo } from "@/lib/safe-return-to";
import {
  TEACHER_ATTENDANCE_CATEGORY_LABEL,
  type TeacherAttendanceCategory,
  type TeacherAttendanceRow,
} from "@/lib/teacher-attendance-report";
import type { AppData } from "@/lib/types";

const ATTENDANCE_COLUMNS: TeacherAttendanceCategory[] = ["attended", "absent", "excused", "unmarked"];
const SOURCE_COLUMNS: TeacherAttendanceCategory[] = [
  "teacher_source",
  "institution_source",
  "student_other_source",
  "unspecified_source",
];
const ALL_CATEGORIES = [...ATTENDANCE_COLUMNS, ...SOURCE_COLUMNS];

const SHORT: Record<TeacherAttendanceCategory, string> = {
  attended: "Katıldı",
  absent: "Gelmedi",
  excused: "Mazeretli",
  unmarked: "Girilmedi",
  teacher_source: "Öğretmen",
  institution_source: "Kurum",
  student_other_source: "Öğrenci/diğer",
  unspecified_source: "Belirtilmemiş",
};

export type TeacherViewParams = {
  datePreset?: string;
  from?: string;
  to?: string;
  branchId?: string;
  teacherId?: string;
  kategori?: string;
};

/**
 * 9. tur — Yoklama Raporu › Öğretmen yoklaması. İki ayrı eksen: öğretmen katılımı
 * ve iptal/telafi kaynağı (bkz. teacher-attendance-report.ts). Her sayı, aynı
 * sınıflandırıcıyla süzülmüş ders listesine iner — rapor = detay.
 */
export async function TeacherAttendanceView({
  session,
  data,
  sp,
}: {
  session: ServiceContext;
  data: AppData;
  sp: TeacherViewParams;
}) {
  const datePreset = (sp.datePreset as "today" | "this_week" | "this_month" | "custom") || "this_month";
  const category = ALL_CATEGORIES.includes(sp.kategori as TeacherAttendanceCategory)
    ? (sp.kategori as TeacherAttendanceCategory)
    : undefined;
  const result = await getTeacherAttendanceReportTool(session, {
    datePreset,
    from: sp.from || undefined,
    to: sp.to || undefined,
    branchId: sp.branchId || undefined,
    teacherId: sp.teacherId || undefined,
    category,
  });
  if (!result.ok) {
    return (
      <Card>
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {result.error.message === "Invalid input"
            ? "Filtrelerden biri geçersiz görünüyor. Filtreleri temizleyip tekrar deneyin."
            : result.error.message}
        </p>
      </Card>
    );
  }
  const { range, rows, totals, detail } = result.data;
  const base = new URLSearchParams({ gorunum: "ogretmen", datePreset });
  if (sp.from) base.set("from", sp.from);
  if (sp.to) base.set("to", sp.to);
  if (sp.branchId) base.set("branchId", sp.branchId);
  const hrefFor = (teacherId: string | undefined, cat: TeacherAttendanceCategory | undefined) => {
    const p = new URLSearchParams(base);
    if (teacherId) p.set("teacherId", teacherId);
    else if (sp.teacherId) p.set("teacherId", sp.teacherId);
    if (cat) p.set("kategori", cat);
    return `/panel/yoklama-raporu?${p.toString()}#detay`;
  };
  const currentHref = (() => {
    const p = new URLSearchParams(base);
    if (sp.teacherId) p.set("teacherId", sp.teacherId);
    if (category) p.set("kategori", category);
    return `/panel/yoklama-raporu?${p.toString()}`;
  })();
  const teachers = [...data.teachers].sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const cell = (row: TeacherAttendanceRow, cat: TeacherAttendanceCategory, teacherId?: string) =>
    row[cat] > 0 ? (
      <Link
        href={hrefFor(teacherId, cat)}
        className="font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
        aria-label={`${row[cat]} ders: ${TEACHER_ATTENDANCE_CATEGORY_LABEL[cat]} — listeyi aç`}
      >
        {row[cat]}
      </Link>
    ) : (
      <span className="text-[var(--color-text-muted)]">0</span>
    );

  return (
    <div>
      <Card className="mb-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input type="hidden" name="gorunum" value="ogretmen" />
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
            <Label>Başlangıç (özel)</Label>
            <Input type="date" name="from" defaultValue={sp.from ?? ""} />
          </div>
          <div>
            <Label>Bitiş (özel)</Label>
            <Input type="date" name="to" defaultValue={sp.to ?? ""} />
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
            <Label>Öğretmen</Label>
            <Select name="teacherId" defaultValue={sp.teacherId ?? ""}>
              <option value="">Tümü</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.active === false ? " (pasif)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-full flex items-center gap-2">
            <button
              type="submit"
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-inverted)] hover:bg-[var(--color-primary-hover)]"
            >
              Filtrele
            </button>
            <a
              href="/panel/yoklama-raporu?gorunum=ogretmen"
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
            >
              Temizle
            </a>
          </div>
        </form>
      </Card>

      <p className="mb-3 max-w-3xl text-xs leading-relaxed text-[var(--color-text-muted)]">
        {range.from} — {range.to} · {totals.lessonCount} ders. <strong className="text-[var(--color-text)]">Katılım</strong>{" "}
        öğretmenin derse gelip gelmediğidir (yönetici girer). <strong className="text-[var(--color-text)]">İptal/telafi kaynağı</strong>{" "}
        yalnız iptal edilen veya telafiye alınan derslerde sayılır; iptal/telafi tek başına &quot;öğretmen gelmedi&quot; anlamına gelmez.
        Kaynağı girilmemiş eski kayıtlar &quot;Belirtilmemiş&quot; kalır. Telafi dersleri ayrı derstir, asıl olayı tekrar saymaz.
        Hakedişten otomatik kesinti yapılmaz.
      </p>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[56rem] text-left text-sm tabular-nums">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs text-[var(--color-text-muted)]">
            <tr>
              <th rowSpan={2} className="sticky left-0 z-[1] bg-[var(--color-surface-muted)] px-3 py-2 align-bottom">
                Öğretmen
              </th>
              <th rowSpan={2} className="px-3 py-2 align-bottom">
                Ders
              </th>
              <th colSpan={ATTENDANCE_COLUMNS.length} className="border-l border-[var(--color-border)] px-3 pt-2 text-center font-semibold uppercase tracking-wide">
                Öğretmen katılımı
              </th>
              <th colSpan={SOURCE_COLUMNS.length} className="border-l border-[var(--color-border)] px-3 pt-2 text-center font-semibold uppercase tracking-wide">
                İptal / telafi kaynağı
              </th>
            </tr>
            <tr>
              {ALL_CATEGORIES.map((c, i) => (
                <th
                  key={c}
                  className={`px-3 pb-2 pt-1 font-medium ${i === 0 || i === ATTENDANCE_COLUMNS.length ? "border-l border-[var(--color-border)]" : ""}`}
                  title={TEACHER_ATTENDANCE_CATEGORY_LABEL[c]}
                >
                  {SHORT[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2 + ALL_CATEGORIES.length} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  Bu filtrelerde ders yok.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.teacherId} className="border-b border-[var(--color-border)]">
                  <td className="sticky left-0 bg-[var(--color-surface)] px-3 py-2 font-medium text-[var(--color-text)]">
                    <Link href={hrefFor(r.teacherId, undefined)} className="hover:text-[var(--color-primary)]">
                      {r.teacherName}
                    </Link>
                    {!r.teacherActive ? <span className="ml-1.5 text-[10px] text-[var(--color-text-muted)]">(pasif)</span> : null}
                  </td>
                  <td className="px-3 py-2">{r.lessonCount}</td>
                  {ALL_CATEGORIES.map((c, i) => (
                    <td
                      key={c}
                      className={`px-3 py-2 ${i === 0 || i === ATTENDANCE_COLUMNS.length ? "border-l border-[var(--color-border)]" : ""}`}
                    >
                      {cell(r, c, r.teacherId)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot className="bg-[var(--color-surface-muted)] font-semibold">
              <tr>
                <td className="sticky left-0 bg-[var(--color-surface-muted)] px-3 py-2">Toplam</td>
                <td className="px-3 py-2">{totals.lessonCount}</td>
                {ALL_CATEGORIES.map((c, i) => (
                  <td
                    key={c}
                    className={`px-3 py-2 ${i === 0 || i === ATTENDANCE_COLUMNS.length ? "border-l border-[var(--color-border)]" : ""}`}
                  >
                    {cell(totals, c)}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </Card>

      {category || sp.teacherId ? (
        <section id="detay" className="mt-6 scroll-mt-4" aria-label="Ders detayı">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              {category ? TEACHER_ATTENDANCE_CATEGORY_LABEL[category] : "Tüm dersler"}
              {sp.teacherId ? ` · ${data.teachers.find((t) => t.id === sp.teacherId)?.name ?? ""}` : ""} — {detail.length} ders
            </h2>
            <Link
              href={`/panel/yoklama-raporu?${base.toString()}`}
              className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              Detayı kapat
            </Link>
          </div>
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2">Tarih/Saat</th>
                  <th className="px-3 py-2">Öğretmen</th>
                  <th className="px-3 py-2">Öğrenci</th>
                  <th className="px-3 py-2">Şube</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {detail.map((d) => (
                  <tr key={d.lessonId} className="border-b border-[var(--color-border)] align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-[var(--color-text-muted)]">{formatDateTime(d.startAt)}</td>
                    <td className="px-3 py-2">{d.teacherName}</td>
                    <td className="px-3 py-2">
                      {d.studentName}
                      {d.isMakeupLesson ? <span className="ml-1 text-[10px] text-[var(--color-text-muted)]">(telafi dersi)</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{d.branchName ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {d.categories.map((c) => (
                          <span key={c} className="rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[11px]">
                            {TEACHER_ATTENDANCE_CATEGORY_LABEL[c]}
                          </span>
                        ))}
                      </div>
                      {d.disruptionNote ? <p className="mt-1 text-xs text-[var(--color-text-muted)]">{d.disruptionNote}</p> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link
                        href={withReturnTo(`/panel/program?week=${d.startAt.slice(0, 10)}`, currentHref)}
                        className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                      >
                        Programda aç →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
