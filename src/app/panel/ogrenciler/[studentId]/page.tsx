import Link from "@/components/link";
import { withReturnTo } from "@/lib/safe-return-to";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2 } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { PlannedMakeupMarker } from "@/components/planned-makeup-marker";
import { RegistrationSuccessPanel } from "@/components/registration-success-panel";
import { listStudentContractsTool } from "@/lib/services";
import { contractStatusLabel } from "@/lib/contracts";
import { isTerminalContractStatus, selectCurrentContract } from "@/lib/contract-list-helpers";
import { computeStudentPaymentSummary, sortPaymentsForProfile, splitStudentDebt } from "@/lib/payment-profile";
import { resolveLessonFinalStatus } from "@/lib/lesson-live-status";
import { formatDate, formatDateTime, formatMoney, formatTime } from "@/lib/utils";
import { loadStudentPageContext } from "./_context";
import { StudentEnrollmentsCard } from "@/components/student-enrollments-card";
import { draftFromTerms } from "@/lib/enrollment-form";
import { buildEnrollmentFormContext } from "@/lib/enrollment-form-context";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "@/lib/timezone";
import {
  contractEnrollmentId,
  effectiveEnrollments,
  enrollmentDisplayName,
  enrollmentTerms,
  UNASSIGNED_ENROLLMENT_LABEL,
} from "@/lib/student-enrollments";
import { resolveActiveInstrumentNames } from "@/lib/instrument-catalog";
import { MiniStat } from "./_components/fields";
import { ContractReturnBanner } from "./_components/contract-return-banner";

export const dynamic = "force-dynamic";

/**
 * J — Öğrenci ÖZETİ (2026-09-20, yeni).
 *
 * Eskiden öğrenci detayı 13 bölümlük tek bir sayfaydı ve "bu öğrencide durum
 * ne?" sorusunun tek bakışta cevabı HİÇBİR yerde yoktu; yönetici ödemeyi
 * görmek için aşağı, dersleri görmek için yukarı kaydırıyordu. Bu sekme o
 * cevabı verir: aksiyon gerektiren şeyler üstte, ayrıntı sekmelerde.
 */
export default async function StudentOverviewTab({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ yeniKayit?: string; sure?: string; davetUyari?: string; sozlesmeDon?: string; sozlesmeSure?: string; duzenleBrans?: string }>;
}) {
  const { studentId } = await params;
  const { yeniKayit, sure, davetUyari, sozlesmeDon, sozlesmeSure, duzenleBrans } = await searchParams;
  const { session, data, student, kurum, canManage } = await loadStudentPageContext(studentId);
  if (!student) notFound();

  const rawIntendedDuration = Number(sure);
  const intendedDurationMonths =
    Number.isInteger(rawIntendedDuration) && rawIntendedDuration >= 1 && rawIntendedDuration <= 12 ? rawIntendedDuration : 3;

  const contractsResult = await listStudentContractsTool(session, { studentId: student.id });
  const contracts = contractsResult.ok ? contractsResult.data.contracts : [];
  // 2026-10-09 — güncel sözleşme BRANŞ başınadır (tek branşlı öğrencide eski davranışla aynı tek sözleşme).
  const branchList = effectiveEnrollments(student, data.teachers);
  const multiBranch = branchList.length > 1;
  const branchName = (id?: string) => {
    const e = id ? branchList.find((x) => x.id === id) : undefined;
    return e ? enrollmentDisplayName(e, branchList, data.teachers) : UNASSIGNED_ENROLLMENT_LABEL;
  };
  const contractsOfBranch = (id: string) => contracts.filter((c) => contractEnrollmentId(student, c, data.teachers) === id);
  const branchContracts = branchList.map((e) => ({ enrollment: e, current: selectCurrentContract(contractsOfBranch(e.id)), all: contractsOfBranch(e.id) }));
  const unassignedLive = multiBranch ? contracts.filter((c) => !contractEnrollmentId(student, c, data.teachers) && !isTerminalContractStatus(c.status)) : [];
  const currentContract = multiBranch ? null : selectCurrentContract(contracts);

  const payments = sortPaymentsForProfile(data.payments.filter((p) => p.studentId === student.id));
  const paymentSummary = computeStudentPaymentSummary(payments, contracts);

  const now = new Date();
  const lessons = data.lessons.filter((l) => l.studentId === student.id);
  const nextLessons = lessons
    .filter((l) => new Date(l.startAt) >= now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 3);
  const openMakeups = data.makeupRequests.filter(
    (m) => m.studentId === student.id && (m.status === "pending" || m.status === "suggested" || m.status === "awaiting_info")
  );

  const todayYmd = now.toISOString().slice(0, 10);
  const contractEnd = currentContract?.enrollmentEndDate?.slice(0, 10);
  const contractExpiringSoon =
    contractEnd !== undefined &&
    contractEnd >= todayYmd &&
    (new Date(`${contractEnd}T00:00:00Z`).getTime() - new Date(`${todayYmd}T00:00:00Z`).getTime()) / 86_400_000 <= 30;

  /** Aksiyon gerektiren başlıklar — "sadece bilgi" olanlardan AYRI tutulur. */
  const alerts: { key: string; label: string; href: string; tone: "danger" | "warning" }[] = [];
  if (paymentSummary.overdueRemaining > 0) {
    // Tutar ve dönemler AYNI kanonik kuraldan (isLiveObligation): iptal/yenilenmiş sözleşme taksiti girmez.
    const overduePeriods = splitStudentDebt(
      payments,
      new Set(contracts.filter((c) => isTerminalContractStatus(c.status)).map((c) => c.id))
    )
      .open.filter((p) => p.status === "overdue")
      .map((p) => p.installmentPeriodLabel ?? formatDate(p.dueDate));
    alerts.push({
      key: "overdue",
      label: `Gecikmiş tahsilat: ${formatMoney(paymentSummary.overdueRemaining)} (${overduePeriods.slice(0, 3).join(", ")}${overduePeriods.length > 3 ? ` +${overduePeriods.length - 3}` : ""})`,
      href: `/panel/ogrenciler/${student.id}/odemeler#borc-baslik`,
      tone: "danger",
    });
  }
  if (multiBranch) {
    for (const bc of branchContracts) {
      if (!bc.enrollment.active) continue;
      const label = branchName(bc.enrollment.id);
      const end = bc.current?.enrollmentEndDate?.slice(0, 10);
      if (!bc.current) {
        alerts.push({
          key: `no-contract-${bc.enrollment.id}`,
          label: `${label}: ${bc.all.length > 0 ? "aktif sözleşme yok (geçmiş kayıtlar iptal/yenilenmiş)" : "sözleşme bekliyor — henüz oluşturulmadı"}`,
          href: `/panel/ogrenciler/${student.id}/sozlesmeler?brans=${encodeURIComponent(bc.enrollment.id)}`,
          tone: "warning",
        });
      } else if (end !== undefined && end < todayYmd) {
        alerts.push({
          key: `expired-${bc.enrollment.id}`,
          label: `${label}: sözleşme süresi doldu (${formatDate(end)}) — yenileme gerekiyor`,
          href: `/panel/ogrenciler/${student.id}/sozlesmeler?brans=${encodeURIComponent(bc.enrollment.id)}`,
          tone: "danger",
        });
      } else if (end !== undefined && (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${todayYmd}T00:00:00Z`).getTime()) / 86_400_000 <= 30) {
        alerts.push({
          key: `expiring-${bc.enrollment.id}`,
          label: `${label}: sözleşme ${formatDate(end)} tarihinde bitiyor`,
          href: `/panel/ogrenciler/${student.id}/sozlesmeler?brans=${encodeURIComponent(bc.enrollment.id)}`,
          tone: "warning",
        });
      }
    }
    if (unassignedLive.length > 0) {
      alerts.push({
        key: "unassigned-contract",
        label: `Branşı belirtilmemiş aktif sözleşme: ${unassignedLive.map((c) => c.contractNumber).join(", ")} — Sözleşme Merkezi'nde "Branşa bağla"`,
        href: `/panel/ogrenciler/${student.id}/sozlesmeler`,
        tone: "warning",
      });
    }
  } else if (contracts.length === 0) {
    alerts.push({
      key: "no-contract",
      // Sözleşme kayıtta zorunlu değil (2026-09-22) — hata değil, bekleyen iş.
      label: "Sözleşme bekliyor — henüz oluşturulmadı. Hazır olduğunuzda Sözleşme Merkezi'nden oluşturun.",
      href: `/panel/ogrenciler/${student.id}/sozlesmeler`,
      tone: "warning",
    });
  } else if (!currentContract) {
    alerts.push({
      key: "no-active-contract",
      label: "Aktif sözleşme yok — geçmiş kayıtlar iptal edilmiş veya yenilenmiş",
      href: `/panel/ogrenciler/${student.id}/sozlesmeler`,
      tone: "warning",
    });
  } else if (contractEnd !== undefined && contractEnd < todayYmd) {
    alerts.push({
      key: "expired",
      label: `Sözleşme süresi doldu (${formatDate(contractEnd)}) — yenileme gerekiyor`,
      href: `/panel/ogrenciler/${student.id}/sozlesmeler`,
      tone: "danger",
    });
  } else if (contractExpiringSoon) {
    alerts.push({
      key: "expiring",
      label: `Sözleşme ${formatDate(contractEnd!)} tarihinde bitiyor`,
      href: `/panel/ogrenciler/${student.id}/sozlesmeler`,
      tone: "warning",
    });
  }
  if (openMakeups.length > 0) {
    alerts.push({
      key: "makeup",
      label: `${openMakeups.length} açık telafi talebi`,
      href: `/panel/ogrenciler/${student.id}/program`,
      tone: "warning",
    });
  }
  if (student.paymentPauseStatus === "paused") {
    alerts.push({
      key: "paused",
      label: "Ders programı ödeme nedeniyle duraklatıldı",
      href: `/panel/ogrenciler/${student.id}/odemeler`,
      tone: "warning",
    });
  }

  return (
    <div className="space-y-6">
      {yeniKayit === "1" ? (
        <RegistrationSuccessPanel
          studentId={student.id}
          studentName={student.name}
          inviteWarning={davetUyari}
          branches={branchContracts.map(({ enrollment: e, all }) => {
            const t = enrollmentTerms(student, e, data.teachers);
            const firstPay = payments.find((p) => p.source === "registration_first_payment" && p.enrollmentId === e.id && p.status !== "voided");
            return {
              enrollmentId: e.id,
              label: branchName(e.id),
              packageLabel: t.packageName?.split("—")[0]?.trim() || "Paketsiz",
              monthlyFee: t.monthlyFee,
              paymentMethod: t.paymentMethod,
              startDate: t.startDate,
              durationMonths: t.intendedDurationMonths ?? intendedDurationMonths,
              firstCollection: firstPay
                ? { kind: "paid" as const, amount: firstPay.paidAmount ?? firstPay.amount, method: firstPay.method, date: firstPay.paidAt?.slice(0, 10) }
                : t.monthlyFee === 0
                  ? { kind: "waived" as const }
                  : { kind: "none" as const },
              hasContract: all.some((c) => !isTerminalContractStatus(c.status)),
            };
          })}
        />
      ) : null}

      {sozlesmeDon || sozlesmeSure ? <ContractReturnBanner studentId={student.id} /> : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Aksiyon gerekli</h2>
        {alerts.length === 0 ? (
          <div
            className="flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
            style={{
              borderColor: "color-mix(in srgb, var(--color-success) 30%, transparent)",
              background: "var(--color-success-soft)",
              color: "var(--color-success)",
            }}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Bu öğrenci için bekleyen bir aksiyon yok.
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {alerts.map((a) => (
              <li key={a.key}>
                <Link
                  href={a.href}
                  className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm font-medium transition hover:opacity-90"
                  style={{
                    borderColor: `color-mix(in srgb, var(--color-${a.tone}) 35%, transparent)`,
                    background: `var(--color-${a.tone}-soft)`,
                    color: `var(--color-${a.tone})`,
                  }}
                >
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {a.label}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2026-10-04 — tek öğrenci, birden fazla eğitim: her eğitim enstrüman + öğretmen + süre olarak. */}
      <StudentEnrollmentsCard
        studentId={student.id}
        enrollments={branchContracts.map(({ enrollment: e, current }) => {
          const t = enrollmentTerms(student, e, data.teachers);
          return {
            id: e.id,
            instrument: e.instrument,
            teacherId: t.teacherId,
            branchId: t.branchId,
            lessonDurationMinutes: t.lessonDurationMinutes,
            weeklyLessonCount: t.weeklyLessonCount,
            active: e.active,
            updatedAt: e.updatedAt,
            startDate: t.startDate,
            endDate: e.endDate,
            endReason: e.endReason,
            studentTypes: t.studentTypes,
            packageName: t.packageName,
            monthlyFee: t.monthlyFee,
            paymentMethod: t.paymentMethod,
            paymentDueDay: t.paymentDueDay,
            currentContractNumber: current?.contractNumber,
            draft: draftFromTerms(t, { personBranchId: student.branchId }),
          };
        })}
        formContext={buildEnrollmentFormContext(data, {
          instrumentOptions: kurum.scope.mode === "single" ? await resolveActiveInstrumentNames(kurum.scope.tenantId) : [],
          personBranchId: student.branchId,
          todayYmd: toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE),
        })}
        termType={student.termType ?? "guz"}
        canManage={canManage && kurum.scope.mode === "single"}
        initialEditId={duzenleBrans}
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {multiBranch ? (
          <MiniStat
            label="Güncel sözleşmeler tahakkuku (tüm branşlar)"
            value={formatMoney(
              branchContracts.reduce(
                (sum, bc) => sum + (bc.current ? payments.filter((p) => p.contractId === bc.current!.id && p.status !== "voided").reduce((s2, p) => s2 + p.amount, 0) : 0),
                0
              )
            )}
          />
        ) : (
          <MiniStat
            label={paymentSummary.currentContractNumber ? `Sözleşme tahakkuku · ${paymentSummary.currentContractNumber}` : "Sözleşme tahakkuku — aktif sözleşme yok"}
            value={paymentSummary.currentContractBilled === null ? "—" : formatMoney(paymentSummary.currentContractBilled)}
          />
        )}
        <MiniStat label="Tahsil edilen (tüm kayıtlar)" value={formatMoney(paymentSummary.totalCollected)} tone="success" />
        <MiniStat label="Kalan borç" value={formatMoney(paymentSummary.remaining)} />
        <MiniStat
          label="Gecikmiş"
          value={formatMoney(paymentSummary.overdueRemaining)}
          tone={paymentSummary.overdueRemaining > 0 ? "danger" : undefined}
        />
        <MiniStat label="Ödenmiş taksit sayısı" value={String(paymentSummary.paidInstallmentCount)} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text)]">
              <CalendarDays className="h-4 w-4 text-[var(--color-text-muted)]" />
              Yaklaşan dersler
            </h2>
            <Link
              href={`/panel/ogrenciler/${student.id}/program`}
              className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
            >
              Tümü →
            </Link>
          </div>
          {nextLessons.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">Planlanmış yaklaşan ders yok.</p>
          ) : (
            <ul className="space-y-2">
              {nextLessons.map((l) => {
                const teacher = data.teachers.find((t) => t.id === l.teacherId);
                const room = data.rooms.find((r) => r.id === l.roomId);
                return (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium text-[var(--color-text)]">
                        {formatDate(l.startAt)} · {formatTime(l.startAt)}–{formatTime(l.endAt)}
                      </span>
                      <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                        {l.instrument} · {teacher?.name ?? "—"} · {room?.name ?? "—"}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Badge status={resolveLessonFinalStatus(l)} />
                      {l.type === "makeup" && resolveLessonFinalStatus(l) === "attended" ? <PlannedMakeupMarker /> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Güncel sözleşme</h2>
            <Link
              href={`/panel/ogrenciler/${student.id}/sozlesmeler`}
              className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
            >
              Sözleşme Merkezi →
            </Link>
          </div>
          {multiBranch ? (
            <ul className="space-y-2 text-sm">
              {branchContracts.map(({ enrollment: e, current }) => (
                <li key={e.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[var(--color-text)]">{branchName(e.id)}</span>
                    {current ? (
                      <>
                        <span>{current.contractNumber}</span>
                        <Badge status={current.status}>{contractStatusLabel(current.status)}</Badge>
                      </>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">Aktif sözleşme yok</span>
                    )}
                    {!e.active ? <span className="text-xs text-[var(--color-text-muted)]">(branş sonlandı)</span> : null}
                  </p>
                  {current ? (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {formatDate(current.enrollmentStartDate)} – {formatDate(current.enrollmentEndDate)} · Aylık{" "}
                      {formatMoney(current.monthlyAmount)} · {current.installmentCount} taksit
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : !currentContract ? (
            <EmptyState
              title={contracts.length > 0 ? "Aktif sözleşme yok" : "Sözleşme yok"}
              description={
                contracts.length > 0
                  ? "Bu öğrencinin sözleşmeleri iptal edilmiş veya yenilenmiş. Güncel bir kayıt yok; geçmiş Sözleşme Merkezi'nde durur."
                  : "Bu öğrenci için henüz bir kayıt sözleşmesi oluşturulmamış."
              }
            />
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--color-text)]">{currentContract.contractNumber}</span>
                <Badge status={currentContract.status}>{contractStatusLabel(currentContract.status)}</Badge>
                <span className="text-xs text-[var(--color-text-muted)]">({contracts.length} kayıt)</span>
              </div>
              <p className="text-[var(--color-text-muted)]">
                {formatDate(currentContract.enrollmentStartDate)} – {formatDate(currentContract.enrollmentEndDate)} ·{" "}
                {currentContract.durationMonths} ay
              </p>
              <p className="text-[var(--color-text-muted)]">
                Aylık {formatMoney(currentContract.monthlyAmount)} · Toplam{" "}
                {formatMoney(currentContract.totalContractAmount)} · {currentContract.installmentCount} taksit
              </p>
              {currentContract.documentInstanceId ? (
                <Link
                  href={withReturnTo(`/sozlesme-yazdir/${currentContract.id}`, `/panel/ogrenciler/${student.id}`)}
                  target="_blank"
                  className="inline-block font-medium text-[var(--color-primary)] hover:underline"
                >
                  Sözleşmeyi görüntüle / PDF →
                </Link>
              ) : null}
            </dl>
          )}
        </Card>
      </div>

      {openMakeups.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Açık telafi talepleri</h2>
          <div className="space-y-2">
            {openMakeups.map((m) => (
              <Card key={m.id} className="!p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {m.instrument} · {m.reason}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">Son tarih: {formatDateTime(m.expiresAt)}</p>
                  </div>
                  <Badge status={m.status} />
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
