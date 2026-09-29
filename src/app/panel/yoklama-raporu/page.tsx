import { redirect } from "next/navigation";
import { getAttendanceReportTool } from "@/lib/services";
import { readData } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { withReturnTo } from "@/lib/safe-return-to";
import { Card, Input, Label, PageHeader, Select, StatCard } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { LessonStatusBadge } from "@/components/lesson-status-badge";
import { computeAllStudentAttendanceRisks } from "@/lib/insights/attendance-risk";
import { AiInsightTrigger } from "@/components/ai/ai-insight-trigger";
import Link from "next/link";
import { ScopeTabs } from "@/components/scope-tabs";
import { TeacherAttendanceView } from "./teacher-view";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  attended: "Geldi",
  processed: "İşlendi",
  makeup: "Telafi",
  makeup_planned: "Planlanan telafi",
  cancelled: "İptal",
  planned: "Planlandı",
};

/**
 * P0-F (2026-09-02) — her durum GÖRSEL OLARAK AYRI bir renk taşımalı
 * (Geldi=yeşil, İşlendi=kırmızı, Telafi=sarı, Gelmedi=gri/turuncu,
 * Mazeretli=mor/nötr mavi, İptal=koyu gri). Önceden Gelmedi paylaşılan
 * `absent` anahtarını (Telafi ile AYNI kırmızı) kullanıyordu — ikisi
 * görsel olarak ayırt edilemiyordu; artık kendi anahtarları var (bkz.
 * utils.ts statusColor — yalnız EKLEME, başka hiçbir ekranın rengini
 * değiştirmez).
 */
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
    gorunum?: string;
    kategori?: string;
    sayfa?: string;
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
  // 9. tur — öğrenci ve öğretmen yoklaması ayrı görünüm; öğrenci raporu aynen korunur.
  const view = sp.gorunum === "ogretmen" ? "ogretmen" : "ogrenci";
  const viewTabs = (
    <div className="mb-4">
      <ScopeTabs
        label="Rapor türü"
        active={view}
        items={[
          { key: "ogrenci", label: "Öğrenci yoklaması", href: "/panel/yoklama-raporu" },
          { key: "ogretmen", label: "Öğretmen yoklaması", href: "/panel/yoklama-raporu?gorunum=ogretmen" },
        ]}
      />
    </div>
  );
  if (view === "ogretmen") {
    return (
      <div>
        <PageHeader
          title="Yoklama Raporu"
          description="Öğretmen katılımı ve iptal/telafi kaynağı — derse kadar inilebilir."
        />
        {viewTabs}
        <TeacherAttendanceView session={session} data={await readData()} sp={sp} />
      </div>
    );
  }
  const datePreset = (sp.datePreset as "today" | "this_week" | "this_month" | "custom") || "this_month";

  const [result, data] = await Promise.all([
    getAttendanceReportTool(session, {
      datePreset,
      // P0 (2026-09-05) — kök neden: filtre formu TEK bir <form method="get">
      // (bkz. aşağıdaki JSX) — herhangi bir alan (ör. Öğrenci) değiştirilip
      // gönderildiğinde datePreset "custom" olmasa bile boş `from=&to=` de
      // AYNI istekle gider. Diğer TÜM filtreler `|| undefined` ile boş
      // string'i normalize ederken bu ikisi ETMİYORDU — regex şeması boş
      // string'i reddedip jenerik "Invalid input" (bkz. result.ts
      // fromZodError) döndürüyordu; kullanıcı hatayı az önce dokunduğu
      // Öğrenci alanına bağlıyordu, oysa gerçek kaynak bu ikisiydi.
      from: sp.from || undefined,
      to: sp.to || undefined,
      studentId: sp.studentId || undefined,
      teacherId: sp.teacherId || undefined,
      branchId: sp.branchId || undefined,
      instrument: sp.instrument || undefined,
      roomId: sp.roomId || undefined,
      status: (sp.status as never) || undefined,
      // 11. tur iş #4 — sayfa URL'den gelir; filtre formu method=get ile
      // yalnız adlandırılmış alanları gönderdiğinden filtre değişince sayfa
      // parametresi düşer ve liste başa döner.
      page: sp.sayfa || undefined,
    }),
    readData(),
  ]);

  if (!result.ok) {
    // Zod'un jenerik "Invalid input" mesajı hangi filtrenin bozuk olduğunu
    // söylemez; kullanıcıya teknik metin yerine filtreleri sıfırlamayı
    // öneren anlaşılır bir mesaj gösterilir.
    const friendlyMessage =
      result.error.message === "Invalid input"
        ? "Filtrelerden biri geçersiz görünüyor. Lütfen filtreleri sıfırlayıp tekrar deneyin."
        : result.error.message;
    return (
      <div>
        <PageHeader title="Yoklama Raporu" />
        <Card>
          <p className="text-sm text-rose-700" role="alert">
            {friendlyMessage}
          </p>
        </Card>
      </div>
    );
  }

  const { range, summary, rows, total, page: currentPage, pageSize } = result.data;
  // 11. tur iş #4 — sayfalama + satır detayı bağlantıları mevcut filtreleri korur.
  const pageParams = (sayfa: number) => {
    const p = new URLSearchParams();
    if (sp.datePreset) p.set("datePreset", sp.datePreset);
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    if (sp.studentId) p.set("studentId", sp.studentId);
    if (sp.teacherId) p.set("teacherId", sp.teacherId);
    if (sp.branchId) p.set("branchId", sp.branchId);
    if (sp.instrument) p.set("instrument", sp.instrument);
    if (sp.roomId) p.set("roomId", sp.roomId);
    if (sp.status) p.set("status", sp.status);
    if (sayfa > 1) p.set("sayfa", String(sayfa));
    const qs = p.toString();
    return `/panel/yoklama-raporu${qs ? `?${qs}` : ""}`;
  };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, currentPage * pageSize);
  const currentHref = pageParams(currentPage);
  const pagerLinkClass =
    "rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]";
  const teachers = [...data.teachers].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const students = [...data.students].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const instruments = Array.from(new Set(data.lessons.map((l) => l.instrument))).sort((a, b) =>
    a.localeCompare(b, "tr")
  );
  const rooms = [...data.rooms].sort((a, b) => a.name.localeCompare(b.name, "tr"));

  // Bilgi mimarisi (2026-09-22): Devamsızlık riski öğrenciler listesinin tepesinde
  // yer kaplamamalı — operasyonel yeri Yoklama Raporu. Risk hesaplaması aynı
  // saf katmanı kullanır (computeAllStudentAttendanceRisks).
  const risks = computeAllStudentAttendanceRisks(data);
  const atRisk = risks
    .filter((r) => r.riskLevel !== "low")
    .map((r) => ({ ...r, student: data.students.find((s) => s.id === r.studentId) }))
    .filter((r) => r.student)
    .sort((a, b) => (a.riskLevel === b.riskLevel ? 0 : a.riskLevel === "high" ? -1 : 1));
  const highRiskCount = atRisk.filter((r) => r.riskLevel === "high").length;

  return (
    <div>
      <PageHeader
        title="Yoklama Raporu"
        description={`Öğrenci yoklaması · ${range.from} — ${range.to}`}
      />
      {viewTabs}

      {atRisk.length > 0 ? (
        <Card className="mb-6 border-amber-200 bg-amber-50/40">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">
                Devamsızlık riski · {atRisk.length} öğrenci
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {highRiskCount > 0
                  ? `${highRiskCount} yüksek risk · ${atRisk.length - highRiskCount} orta risk`
                  : "Tümü orta risk bandında"}
                {" · "}Öğrenci listesinden taşındı — burası operasyonel takip yeri.
              </p>
            </div>
            <AiInsightTrigger
              capabilityId="attendanceRiskAssessment"
              label="AI ile yorumla"
              payload={{
                atRiskCount: atRisk.length,
                highRiskCount,
                topCases: atRisk.slice(0, 5).map((r) => ({
                  studentName: r.student?.name,
                  riskLevel: r.riskLevel,
                  absentCount: r.absentCount,
                  consecutiveAbsences: r.consecutiveAbsences,
                })),
              }}
            />
          </div>
          <ul className="divide-y divide-amber-100/80 text-sm">
            {atRisk.slice(0, 12).map((r) => (
              <li key={r.studentId} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <Link
                  href={`/panel/ogrenciler/${r.studentId}`}
                  className="font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]"
                >
                  {r.student?.name}
                </Link>
                <span
                  className={
                    r.riskLevel === "high"
                      ? "shrink-0 text-xs font-semibold text-rose-700"
                      : "shrink-0 text-xs font-semibold text-amber-700"
                  }
                >
                  {r.riskLevel === "high" ? "Yüksek" : "Orta"} · {r.absentCount} gelmedi
                  {r.consecutiveAbsences >= 2 ? ` · ${r.consecutiveAbsences} art arda` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="mb-6 border-[var(--color-border)] bg-[var(--color-surface-muted)]/40">
          <p className="text-sm text-[var(--color-text-muted)]">
            Devamsızlık riski taşıyan öğrenci yok — mevcut yoklama kayıtlarına göre tüm öğrenciler düşük risk bandında.
          </p>
        </Card>
      )}

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
        <StatCard label="İşlendi" value={summary.processed} />
        <StatCard label="Telafi" value={summary.makeup} />
        <StatCard label="Planlanan telafi" value={summary.makeupPlanned} />
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
                    <LessonStatusBadge status={r.status} />
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
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <div className="flex flex-col gap-1">
                      <Link
                        href={withReturnTo(`/panel/program?week=${r.startAt.slice(0, 10)}`, currentHref)}
                        className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                      >
                        Programda aç →
                      </Link>
                      <Link
                        href={`/panel/ogrenciler/${r.studentId}`}
                        className="text-xs font-medium text-cyan-700 hover:underline"
                      >
                        Öğrenciye git →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--color-text-muted)]">
          {total} kayıttan {rangeStart}–{rangeEnd} arası · sayfa {currentPage}/{totalPages}
        </p>
        <div className="flex items-center gap-2">
          {currentPage > 1 ? (
            <Link href={pageParams(currentPage - 1)} className={pagerLinkClass}>
              ← Önceki
            </Link>
          ) : null}
          {currentPage < totalPages ? (
            <Link href={pageParams(currentPage + 1)} className={pagerLinkClass}>
              Sonraki →
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
