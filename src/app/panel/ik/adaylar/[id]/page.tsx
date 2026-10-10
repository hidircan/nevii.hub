import Link from "@/components/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, MapPin, Link2, FileText, Clock, MessageSquare, CalendarClock, Star, Send, Info } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { requireRecruitmentPage } from "@/lib/recruitment/page-context";
import { getApplicationDetailTool } from "@/lib/recruitment/tools";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { readReferenceData } from "@/lib/store";
import { HIRE_PENDING } from "@/lib/recruitment/store";
import {
  applicationNumber,
  CATEGORY_LABELS,
  EDUCATION_LABELS,
  INTERVIEW_KIND_LABELS,
  RECOMMENDATION_LABELS,
  SOURCE_LABELS,
  fullName,
} from "@/lib/recruitment/constants";
import { StageBadge, Rating, Chip } from "@/components/recruitment/badges";
import { CandidateToolbar, InterviewStatusSelect, NoteComposer, TagEditor } from "@/components/recruitment/candidate-actions";
import type { ActivityType } from "@/lib/recruitment/types";

export const dynamic = "force-dynamic";

const dt = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const d = (iso: string) => new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

const ACT_ICON: Record<ActivityType, typeof Clock> = {
  note: MessageSquare,
  stage_change: Clock,
  email: Send,
  interview: CalendarClock,
  evaluation: Star,
  system: Info,
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-[var(--color-text-muted)]">{label}</dt>
      <dd className="min-w-0 break-words">{children || <span className="text-[var(--color-text-muted)]">—</span>}</dd>
    </div>
  );
}

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, allMode } = await requireRecruitmentPage(`/panel/ik/adaylar/${id}`);
  if (allMode) return <EmptyState title="Tek bir kurum seçin" />;
  const res = await runWithTenantAsync(ctx.tenantId, () => getApplicationDetailTool(ctx, { id }));
  if (!res.ok) {
    if (res.error.code === "NOT_FOUND") notFound();
    return <EmptyState title="Aday yüklenemedi" description={res.error.message} />;
  }
  const { application: a, job, activities, interviews, evaluations, cv, templates, settings } = res.data;
  const data = await runWithTenantAsync(ctx.tenantId, () => readReferenceData());
  const branches = data.settings.branches.map((b) => ({ id: b.id, name: b.name }));
  let instruments: string[] = [];
  try {
    const { resolveActiveInstrumentNames } = await import("@/lib/instrument-catalog");
    instruments = await resolveActiveInstrumentNames(ctx.tenantId);
  } catch {
    instruments = [];
  }
  const p = a.profile;
  const teacherRef = a.hiredTeacherId && a.hiredTeacherId !== HIRE_PENDING ? a.hiredTeacherId : null;
  const convertedHref = teacherRef ? `/panel/ogretmenler/${teacherRef}` : a.hiredStaffId ? `/panel/personel/${a.hiredStaffId}` : null;
  const criteriaLabel = new Map(settings.scorecardCriteria.map((c) => [c.key, c.label]));

  return (
    <>
      <Link href="/panel/ik/adaylar" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] print:hidden">
        <ArrowLeft className="h-4 w-4" /> Aday havuzu
      </Link>

      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">{fullName(a)}</h1>
              <StageBadge stage={a.stage} />
              <Rating value={a.ratingAvg} />
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {applicationNumber(a.seq)} · {job ? job.title : `Genel başvuru`} · {CATEGORY_LABELS[a.category]} · {SOURCE_LABELS[a.source]} · {d(a.createdAt)}
            </p>
            <div className="mt-2"><TagEditor app={a} /></div>
          </div>
        </div>
        {a.anonymizedAt ? (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-warning-soft)] p-3 text-sm">Bu başvuru {d(a.anonymizedAt)} tarihinde KVKK kapsamında anonimleştirildi; kişisel veriler silindi.</p>
        ) : null}
        <CandidateToolbar
          app={a}
          templates={templates}
          criteria={settings.scorecardCriteria}
          interviews={interviews}
          branches={branches}
          instruments={instruments}
          hasCv={!!cv}
          convertedHref={convertedHref}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 text-base font-semibold">İletişim</h2>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <a href={`mailto:${a.email}`} className="flex items-center gap-2 hover:text-[var(--color-primary)]"><Mail className="h-4 w-4 text-[var(--color-text-muted)]" /> {a.email}</a>
              {a.phone ? <a href={`tel:${a.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 hover:text-[var(--color-primary)]"><Phone className="h-4 w-4 text-[var(--color-text-muted)]" /> {a.phone}</a> : null}
              {a.city ? <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[var(--color-text-muted)]" /> {a.city}</span> : null}
              {p.linkedinUrl ? <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 truncate hover:text-[var(--color-primary)]"><Link2 className="h-4 w-4 text-[var(--color-text-muted)]" /> LinkedIn</a> : null}
              {p.portfolioUrl ? <a href={p.portfolioUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 truncate hover:text-[var(--color-primary)]"><Link2 className="h-4 w-4 text-[var(--color-text-muted)]" /> Portfolyo / video</a> : null}
              {cv ? <a href={`/api/panel/ik/cv/${a.id}`} className="flex items-center gap-2 hover:text-[var(--color-primary)]"><FileText className="h-4 w-4 text-[var(--color-text-muted)]" /> {cv.fileName} ({Math.round(cv.sizeBytes / 1024)} KB)</a> : null}
            </div>
          </Card>

          <Card>
            <h2 className="mb-2 text-base font-semibold">Deneyim ve eğitim</h2>
            <dl className="divide-y divide-[var(--color-border)]">
              <Row label="Enstrüman / branş">{a.instruments.length ? <span className="flex flex-wrap gap-1">{a.instruments.map((i) => <Chip key={i} tone="primary">{i}</Chip>)}</span> : null}</Row>
              <Row label="Toplam deneyim">{a.experienceYears !== null ? `${a.experienceYears} yıl` : null}</Row>
              <Row label="Öğretmenlik">{a.teachingYears !== null ? `${a.teachingYears} yıl` : null}</Row>
              <Row label="Güncel pozisyon">{[p.currentPosition, p.currentEmployer].filter(Boolean).join(" — ")}</Row>
              <Row label="Eğitim düzeyi">{a.educationLevel ? EDUCATION_LABELS[a.educationLevel] : null}</Row>
              <Row label="Okul">{p.school}</Row>
              <Row label="Bölüm">{p.department}</Row>
              <Row label="Mezuniyet">{p.graduationYear}</Row>
              <Row label="Diller">{p.languages?.join(", ")}</Row>
              <Row label="Doğum yılı">{p.birthYear}</Row>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-2 text-base font-semibold">Uygunluk ve ön yazı</h2>
            <dl className="divide-y divide-[var(--color-border)]">
              <Row label="Müsaitlik">{p.availability}</Row>
              <Row label="Başlama tarihi">{p.availableFrom}</Row>
              {p.expectedSalary ? <Row label="Ücret beklentisi">{p.expectedSalary}</Row> : null}
            </dl>
            {p.coverLetter ? <p className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] p-3 text-sm leading-relaxed">{p.coverLetter}</p> : null}
          </Card>

          <Card>
            <h2 className="mb-2 text-base font-semibold">Kaynak ve KVKK</h2>
            <dl className="divide-y divide-[var(--color-border)]">
              <Row label="Kaynak">{SOURCE_LABELS[a.source]}{p.utm && Object.keys(p.utm).length ? <span className="ml-2 text-xs text-[var(--color-text-muted)]">{Object.entries(p.utm).map(([k, v]) => `${k}=${v}`).join(" · ")}</span> : null}</Row>
              <Row label="CV okuma">{p.cvParse ? `${p.cvParse.method === "ai" ? "AI" : "Kural tabanlı"} · ${p.cvParse.fields.length} alan otomatik dolduruldu` : "Kullanılmadı"}</Row>
              <Row label="KVKK onayı">{a.kvkkConsentAt ? `${dt(a.kvkkConsentAt)} (metin ${a.kvkkTextVersion})` : null}</Row>
              <Row label="Saklama bitişi">{a.retentionUntil ? d(a.retentionUntil) : null}</Row>
            </dl>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-base font-semibold">Görüşmeler</h2>
            {interviews.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">Planlanmış görüşme yok.</p>
            ) : (
              <ul className="space-y-2.5">
                {interviews.map((i) => (
                  <li key={i.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{INTERVIEW_KIND_LABELS[i.kind]}</span>
                      <InterviewStatusSelect interview={i} />
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {dt(i.scheduledAt)} · {i.durationMinutes} dk{i.location ? ` · ${i.location}` : ""}
                    </p>
                    {i.interviewers ? <p className="text-xs text-[var(--color-text-muted)]">Görüşmeci: {i.interviewers}</p> : null}
                    <p className="text-xs text-[var(--color-text-muted)]">{i.invitationSentAt ? `Davet gönderildi: ${dt(i.invitationSentAt)}` : "Davet e-postası gönderilmedi"}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-base font-semibold">Değerlendirmeler</h2>
            {evaluations.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">Henüz puan kartı yok.</p>
            ) : (
              <ul className="space-y-3">
                {evaluations.map((e) => (
                  <li key={e.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{e.evaluatorName || "Yönetici"}</span>
                      <Rating value={e.overall} />
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">{RECOMMENDATION_LABELS[e.recommendation]} · {dt(e.createdAt)}</p>
                    <ul className="mt-2 space-y-0.5 text-xs">
                      {Object.entries(e.scores).map(([k, v]) => (
                        <li key={k} className="flex justify-between"><span>{criteriaLabel.get(k) ?? k}</span><span className="tabular-nums">{v}/5</span></li>
                      ))}
                    </ul>
                    {e.comment ? <p className="mt-2 whitespace-pre-line text-xs">{e.comment}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-base font-semibold">Zaman çizelgesi</h2>
            <NoteComposer id={a.id} disabled={!!a.anonymizedAt} />
            <ol className="mt-4 space-y-3">
              {activities.map((act) => {
                const Icon = ACT_ICON[act.type] ?? Info;
                return (
                  <li key={act.id} className="flex gap-2.5 text-sm">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-muted)]">
                      <Icon className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                    </span>
                    <div className="min-w-0">
                      <p className="whitespace-pre-line break-words">{act.body}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{act.actorName || "Sistem"} · {dt(act.createdAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
