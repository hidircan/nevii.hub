import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileText,
  Megaphone,
  RefreshCcw,
  Video,
} from "lucide-react";
import { addDays, isSameDay, parseISO } from "date-fns";
import { requireSessionContext } from "@/lib/auth/session";
import { readData } from "@/lib/store";
import { listAnnouncementsForUserTool, listCurriculumForStudentTool } from "@/lib/services";
import { listNotificationsForUser } from "@/lib/notifications";
import { listClosedDays } from "@/lib/closed-day-overrides";
import { NotificationList } from "@/components/notification-list";
import { AnnouncementAttachments } from "@/components/announcement-attachments";
import { LogoutButton } from "@/components/logout-button";
import { Badge, Card } from "@/components/ui";
import { LessonStatusBadge } from "@/components/lesson-status-badge";
import { AttendanceCalendarPanel } from "@/components/attendance-calendar-panel";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { PayNowButton } from "@/components/pay-now-button";
import { formatDateTime, formatDate, formatTime, formatMoney } from "@/lib/utils";
import { resolveLessonFinalStatus } from "@/lib/lesson-live-status";
import { ownStudentWeekLessons } from "@/lib/student-portal-scope";
import { normalizeWeekStart, previousWeekParam, nextWeekParam, todayWeekParam, isCurrentWeek } from "@/lib/program-week";
import { weeklyClosedDaysForTerm, resolveDayStatus } from "@/lib/attendance-calendar";
import { ProgramLiveRefresh } from "@/components/program-live-refresh";

export const dynamic = "force-dynamic";

function phoneToWa(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return `90${digits.slice(1)}`;
  if (digits.startsWith("90")) return digits;
  return digits;
}

/**
 * EPIC 6A/6B (IMPLEMENTATION_PLAN.md) — STUDENT rolü portalı. 6A'da yalnızca
 * program/bildirim/duyuru/gelişim raporuydu; 6B ile ödev ve materyal
 * bağlantıları eklendi (kendi alt-sayfaları, bkz. /ogrenci/odevlerim ve
 * /ogrenci/materyaller).
 *
 * Karma Öğrenci Portalı — eski /veli sayfası buraya birleşti; o sayfanın
 * "Ödemeler" bölümü (bekleyen/gecikmiş özet kartı + ödeme geçmişi listesi +
 * okulla WhatsApp iletişim kısayolu) burada AYNEN korunmuştur — GUARDIAN
 * erişimiyle giren veliler bu sayfayı gördüğü için ödeme görünürlüğü
 * kaybolmamalı.
 */
export default async function OgrenciPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogrenci");
  }
  if (session.role === "TEACHER") redirect("/ogretmen");
  if (session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN") {
    // admins may preview; fall through
  } else if (session.role !== "STUDENT" && session.role !== "AI_AGENT") {
    redirect("/login?next=/ogrenci");
  }

  const data = await readData();
  const studentId = session.studentId;
  if (!studentId) redirect("/login");
  const student = data.students.find((s) => s.id === studentId);
  if (!student) redirect("/login");

  // Pasif/arşivlenmiş öğrenci: portala girebilir ama HİÇBİR ders/ödev/materyal/
  // rapor verisi görmez — yalnız güvenli, açıklayıcı bir ekran. Veri sızıntısı yok.
  if (!student.active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50 to-slate-50 px-4">
        <Card className="max-w-sm text-center">
          <p className="text-sm font-semibold text-[var(--color-text)]">Hesabınız pasif durumda</p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Kaydınız kurum tarafından pasife alınmış. Ders, ödev, materyal ve rapor
            bilgilerine erişim geçici olarak kapalı. Sorularınız için kurumla iletişime
            geçin.
          </p>
          <div className="mt-4">
            <LogoutButton className="!text-xs" />
          </div>
        </Card>
      </div>
    );
  }

  const teacher = data.teachers.find((t) => t.id === student.teacherId);

  // ÖNCELİK 4 (devam) — öğrenci portalı haftalık ders programı. Kimlik
  // KESİN olarak session'dan gelir (`student.id` === `session.studentId`,
  // yukarıda çözüldü) — client'tan hiçbir studentId kabul edilmez, bu
  // yüzden URL/API manipülasyonuyla başka bir öğrencinin (veya başka bir
  // tenant'ın, zaten `readData()` tenant-scoped) programına erişim mümkün
  // değildir. Dönem-bazlı gün seti mevcut ortak mantıktan (attendance-calendar.ts)
  // gelir — tekrar yazılmadı: Güz'de Pazartesi kapalı/hafta sonu açık, Yaz'da
  // tersi. Resmî tatil/özel kapalı gün önceliği de aynı `resolveDayStatus`
  // ile, admin/veli/takvim ekranlarıyla birebir aynı kuraldan okunur.
  const studentTerm = student.termType ?? "guz";
  const now = new Date();
  const weekStart = normalizeWeekStart(week, now);
  const weekEndExclusive = addDays(weekStart, 7);
  const showingCurrentWeek = isCurrentWeek(weekStart, now);
  const closedWeekdays = weeklyClosedDaysForTerm(studentTerm, data.settings.termWeeklyClosedDays);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter(
    (d) => !closedWeekdays.includes(d.getDay())
  );
  const weekLessons = ownStudentWeekLessons(
    data.lessons,
    student.id,
    weekStart.toISOString(),
    weekEndExclusive.toISOString()
  );
  const closedDayOverrides = await listClosedDays(session.tenantId);
  const prevWeekHref = `/ogrenci?week=${previousWeekParam(weekStart)}`;
  const nextWeekHref = `/ogrenci?week=${nextWeekParam(weekStart)}`;
  const todayWeekHref = `/ogrenci?week=${todayWeekParam(now)}`;

  const past = data.lessons
    .filter((l) => l.studentId === student.id && new Date(l.startAt) < new Date())
    .sort((a, b) => b.startAt.localeCompare(a.startAt))
    .slice(0, 5);

  const notifications = await listNotificationsForUser({
    tenantId: data.settings.tenantId,
    userId: session.userId,
    studentId: student.id,
  });

  const announcementsResult = await listAnnouncementsForUserTool(session);
  const announcements = announcementsResult.ok ? announcementsResult.data.announcements : [];

  const curriculumResult = await listCurriculumForStudentTool(session, { studentId: student.id });
  const overallPercent = curriculumResult.ok ? curriculumResult.data.overallPercent : null;

  // Karma Öğrenci Portalı — ödemeler, KESİN olarak `student.id`'ye (session'dan
  // çözülen) filtrelenir; başka bir öğrencinin ödeme kaydı asla görünmez.
  const payments = data.payments.filter((p) => p.studentId === student.id);
  const unpaidPayments = payments.filter((p) => p.status !== "paid");
  const totalOutstanding = unpaidPayments.reduce((sum, p) => sum + Math.max(p.amount - p.paidAmount, 0), 0);
  const hasOverduePayment = unpaidPayments.some((p) => p.status === "overdue");
  const nextDuePayment = [...unpaidPayments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
  const schoolPhone = data.settings.phone;
  const contactMessage = `Merhaba, ${student.name} için ödeme durumu hakkında bilgi almak istiyorum.`;
  const contactWaLink = schoolPhone
    ? `https://wa.me/${phoneToWa(schoolPhone)}?text=${encodeURIComponent(contactMessage)}`
    : null;

  // Telafi hakları — yalnızca bu öğrencinin (session'dan çözülen) makeupRequest'leri.
  const makeups = data.makeupRequests.filter((m) => m.studentId === student.id);
  const confirmedUpcomingMakeups: { request: (typeof makeups)[number]; lesson: (typeof data.lessons)[number] }[] = [];
  for (const m of makeups) {
    if (m.status !== "confirmed" || !m.confirmedLessonId) continue;
    const lesson = data.lessons.find((l) => l.id === m.confirmedLessonId);
    if (!lesson) continue;
    if (new Date(lesson.startAt) < new Date()) continue;
    confirmedUpcomingMakeups.push({ request: m, lesson });
  }
  confirmedUpcomingMakeups.sort((a, b) => a.lesson.startAt.localeCompare(b.lesson.startAt));
  const hasMakeupHighlight = confirmedUpcomingMakeups.length > 0;

  return (
    <div>
      <AssistantPageContext entity={{ kind: "student", id: student.id, label: student.name }} />
      <ProgramLiveRefresh />
      <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <Card className="glass-hero border-emerald-100 bg-[var(--hero-bg)]">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Merhaba</p>
          <h1 className="mt-1 text-xl font-semibold text-[var(--hero-text)]">{student.name}</h1>
          <p className="mt-1 text-sm text-[var(--hero-text-muted)]">
            {student.instruments.join(", ")} · Öğretmen: {teacher?.name ?? "—"}
          </p>
        </Card>

        {/* Ödemelerim — Hero'nun hemen ardından, her zaman görünür (Karma Öğrenci Portalı kritik başarı kriteri). */}
        <div id="odemelerim-ozet" role={hasOverduePayment ? "alert" : undefined}>
          <Card
            className={`!p-4 ${
              hasOverduePayment
                ? "border-rose-300 bg-rose-50"
                : totalOutstanding > 0
                  ? "border-amber-200 bg-amber-50/60"
                  : "border-emerald-100"
            }`}
          >
            <div className="flex items-center gap-2">
              <CreditCard className={`h-4 w-4 ${hasOverduePayment ? "text-rose-700" : "text-emerald-600"}`} />
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Ödemelerim</h2>
            </div>
            {totalOutstanding > 0 ? (
              <>
                <p className={`mt-2 text-xl font-semibold ${hasOverduePayment ? "text-rose-700" : "text-[var(--color-text)]"}`}>
                  {formatMoney(totalOutstanding)}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {hasOverduePayment ? "Gecikmiş tutar dahil toplam kalan borç" : "Toplam kalan borç"}
                  {nextDuePayment ? ` · En yakın vade: ${formatDate(nextDuePayment.dueDate)}` : ""}
                </p>
                <div className="mt-3">
                  <PayNowButton
                    paymentId={nextDuePayment ? nextDuePayment.id : unpaidPayments[0]!.id}
                    contactWaLink={contactWaLink}
                  />
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">Açık ödemen bulunmuyor.</p>
            )}
            <a href="#odemeler" className="mt-3 inline-block text-xs font-medium text-emerald-700 hover:underline">
              Ödeme geçmişini gör →
            </a>
          </Card>
        </div>

        {overallPercent !== null ? (
          <Link href="/ogrenci/mufredat">
            <Card className="!p-4 hover:border-emerald-200">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--color-text)]">Müfredat ilerlemem</p>
                <p className="text-sm font-semibold text-emerald-600">%{overallPercent}</p>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.max(0, Math.min(100, overallPercent))}%` }}
                />
              </div>
            </Card>
          </Link>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Link href="/ogrenci/odevlerim">
            <Card className="!p-4 hover:border-emerald-200">
              <BookOpen className="h-4 w-4 text-emerald-600" />
              <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">Ödevlerim</p>
            </Card>
          </Link>
          <Link href="/ogrenci/materyaller">
            <Card className="!p-4 hover:border-emerald-200">
              <Video className="h-4 w-4 text-emerald-600" />
              <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">Materyaller</p>
            </Card>
          </Link>
          <Link href="/ogrenci/sozlesmelerim">
            <Card className="!p-4 hover:border-emerald-200">
              <FileText className="h-4 w-4 text-emerald-600" />
              <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">Sözleşmelerim</p>
            </Card>
          </Link>
          <Link href="/ogrenci/mufredat" className="col-span-2">
            <Card className="!p-4 hover:border-emerald-200">
              <p className="text-sm font-semibold text-[var(--color-text)]">Müfredatım</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Konu hedefleri ve ilerleme özeti</p>
            </Card>
          </Link>
          <Link href="/ogrenci/degerlendirme" className="col-span-2">
            <Card className="!p-4 hover:border-emerald-200">
              <p className="text-sm font-semibold text-[var(--color-text)]">Öğretmen Değerlendirmesi</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Yalnızca okul yönetimi görür — öğretmene kimliğiniz gösterilmez
              </p>
            </Card>
          </Link>
        </div>

        <Link href={`/degerlendirme/rapor/${student.id}`}>
          <Card className="!p-4 hover:border-emerald-200">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-semibold text-[var(--color-text)]">Gelişim raporunu görüntüle</p>
            </div>
          </Card>
        </Link>

        {/* Telafi vurgusu, ödeme kartını GİZLEMEZ — ikisi de her zaman erişilebilir (kritik başarı kriteri #6). */}
        {hasMakeupHighlight ? (
          <div className="space-y-2">
            {confirmedUpcomingMakeups.map(({ request, lesson }) => {
              const makeupTeacher = data.teachers.find((t) => t.id === lesson.teacherId);
              const makeupBranch = data.settings.branches.find((b) => b.id === lesson.branchId);
              const makeupRoom = data.rooms.find((r) => r.id === lesson.roomId);
              return (
                <Card key={request.id} className="!p-4 border-emerald-200 bg-emerald-50/60">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <p className="text-sm font-semibold">Telafi dersiniz onaylandı</p>
                  </div>
                  <p className="mt-2 text-base font-semibold text-[var(--color-text)]">{formatDateTime(lesson.startAt)}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {formatTime(lesson.startAt)}–{formatTime(lesson.endAt)} · {lesson.instrument}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {makeupTeacher?.name} · {makeupBranch?.shortName}
                    {makeupRoom ? ` · ${makeupRoom.name}` : ""}
                  </p>
                  <p className="mt-2 text-xs text-emerald-700">Programınıza eklendi.</p>
                </Card>
              );
            })}
          </div>
        ) : null}

        <section>
          <div className="mb-2 flex items-center gap-2 px-1">
            <Bell className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Bildirimler</h2>
          </div>
          <NotificationList notifications={notifications} />
        </section>

        {announcements.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center gap-2 px-1">
              <Megaphone className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Duyurular</h2>
            </div>
            <div className="space-y-2">
              {announcements.map((a) => (
                <Card key={a.id} className={a.pinned ? "!p-4 border-emerald-200 bg-emerald-50/60" : "!p-4"}>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{a.title}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{a.body}</p>
                  <AnnouncementAttachments announcementId={a.id} attachments={a.attachments} />
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        <section id="haftalik-program">
          <div className="mb-2 flex items-center gap-2 px-1">
            <CalendarDays className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Haftalık ders programım</h2>
          </div>

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <Link
              href={prevWeekHref}
              aria-label="Önceki hafta"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Önceki
            </Link>
            {showingCurrentWeek ? (
              <span
                aria-current="true"
                className="rounded-lg border border-emerald-300 bg-emerald-100 px-2.5 py-1.5 text-xs font-semibold text-emerald-800"
              >
                Bugün
              </span>
            ) : (
              <Link
                href={todayWeekHref}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                Bugün
              </Link>
            )}
            <Link
              href={nextWeekHref}
              aria-label="Sonraki hafta"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
            >
              Sonraki <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <p className="mb-2 px-1 text-center text-[11px] text-[var(--color-text-muted)]">
            {formatDate(weekStart.toISOString(), "d MMM")} – {formatDate(addDays(weekStart, 6).toISOString(), "d MMM yyyy")} ·{" "}
            {studentTerm === "yaz" ? "Yaz dönemi" : "Güz dönemi"}
          </p>

          {weekDays.length === 0 ? (
            <Card>
              <p className="text-sm text-[var(--color-text-muted)]">Bu dönem için açık gün yok.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {weekDays.map((day) => {
                const today = showingCurrentWeek && isSameDay(day, now);
                const dayLessons = weekLessons.filter((l) => isSameDay(parseISO(l.startAt), day));
                const dayStatus = resolveDayStatus(day, studentTerm, closedDayOverrides, data.settings.termWeeklyClosedDays);
                return (
                  <Card key={day.toISOString()} className={today ? "!p-4 border-emerald-200 bg-emerald-50/30" : "!p-4"}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--color-text)]">{formatDate(day.toISOString(), "EEEE d MMM")}</p>
                      <div className="flex items-center gap-1.5">
                        {dayStatus.status === "closed" ? (
                          <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white" title={dayStatus.label}>
                            Kapalı
                          </span>
                        ) : null}
                        {today ? <Badge status="scheduled">Bugün</Badge> : null}
                      </div>
                    </div>
                    {dayStatus.status === "closed" ? (
                      <p className="text-xs text-[var(--color-text-muted)]">{dayStatus.label} — bu gün ders yok.</p>
                    ) : dayLessons.length === 0 ? (
                      <p className="text-xs text-[var(--color-text-muted)]">Bu gün dersiniz yok.</p>
                    ) : (
                      <div className="space-y-2">
                        {dayLessons.map((l) => {
                          const lessonTeacher = data.teachers.find((t) => t.id === l.teacherId);
                          return (
                            <div
                              key={l.id}
                              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2 text-xs"
                              style={{ borderLeftWidth: 3, borderLeftColor: lessonTeacher?.color ?? "#10b981" }}
                            >
                              <p className="font-semibold text-[var(--color-text)]">
                                {formatTime(l.startAt)}–{formatTime(l.endAt)} · {l.instrument}
                              </p>
                              <p className="text-[var(--color-text-muted)]">{lessonTeacher?.name ?? "—"}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <LessonStatusBadge status={resolveLessonFinalStatus(l, now)} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section id="yoklama-takvimi">
          <div className="mb-2 flex items-center gap-2 px-1">
            <CalendarDays className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Yoklama Takvimi</h2>
          </div>
          <Card className="!p-3">
            <AttendanceCalendarPanel
              studentId={student.id}
              termType={student.termType ?? "guz"}
              canEdit={false}
              readOnly
              showWeekdayLabels={false}
            />
          </Card>
        </section>

        <section id="telafi">
          <div className="mb-2 flex items-center gap-2 px-1">
            <RefreshCcw className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Telafi hakları</h2>
          </div>
          {makeups.length === 0 ? (
            <Card>
              <p className="text-sm text-[var(--color-text-muted)]">Açık telafi yok.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {makeups.map((m) => (
                <Card key={m.id} className="!p-4 border-emerald-100 bg-emerald-50/40">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--color-text)]">{m.instrument}</p>
                      <p className="text-sm text-[var(--color-text-muted)]">{m.reason}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">Son: {formatDateTime(m.expiresAt)}</p>
                    </div>
                    <Badge status={m.status} />
                  </div>
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                    Okul sizin için uygun saat önerecek. Onay sonrası burada görünür.
                  </p>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section id="odemeler">
          <div className="mb-2 flex items-center gap-2 px-1">
            <CreditCard className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Ödemeler</h2>
          </div>
          {payments.length === 0 ? (
            <Card>
              <p className="text-sm text-[var(--color-text-muted)]">Henüz ödeme kaydı yok.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => {
                const remaining = Math.max(p.amount - p.paidAmount, 0);
                return (
                  <Card key={p.id} className="!p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text)]">{p.description}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {p.status === "partial"
                            ? `Ödenen: ${formatMoney(p.paidAmount)} · Kalan: ${formatMoney(remaining)}`
                            : formatMoney(p.amount)}
                        </p>
                        {p.status !== "paid" ? (
                          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Vade: {formatDate(p.dueDate)}</p>
                        ) : null}
                      </div>
                      <Badge status={p.status} />
                    </div>
                    {p.status !== "paid" && p.status !== "voided" ? (
                      <div className="mt-3">
                        <PayNowButton paymentId={p.id} contactWaLink={contactWaLink} label="Öde" />
                      </div>
                    ) : null}
                    {p.status === "paid" ? (
                      <Link
                        href={`/makbuz/${p.id}`}
                        className="mt-3 inline-block text-xs font-medium text-emerald-700 hover:underline"
                      >
                        Makbuzu görüntüle →
                      </Link>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 px-1">
            <CalendarDays className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Geçmiş dersler</h2>
          </div>
          {past.length === 0 ? (
            <Card>
              <p className="text-sm text-[var(--color-text-muted)]">Henüz geçmiş ders yok.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {past.map((l) => (
                <Card key={l.id} className="!p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-[var(--color-text)]">{formatDateTime(l.startAt)}</p>
                    <LessonStatusBadge status={resolveLessonFinalStatus(l, now)} />
                  </div>
                  <p className="text-sm text-[var(--color-text-muted)]">{l.instrument}</p>
                </Card>
              ))}
            </div>
          )}
        </section>

        <p className="px-1 text-center text-[11px] text-[var(--color-text-muted)]">
          Demo görünüm ·{" "}
          <Link href="/panel" className="text-emerald-600">
            Yönetim paneli
          </Link>
        </p>
      </main>
    </div>
  );
}
