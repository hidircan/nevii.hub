"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Download, Mail, Printer, ShieldOff, Star, ThumbsDown, ThumbsUp, UserPlus, X } from "lucide-react";
import { ModalShell } from "@/components/modal-shell";
import {
  actionAddEvaluation,
  actionAddNote,
  actionAnonymizeApplication,
  actionChangeStage,
  actionConvertToEmployee,
  actionScheduleInterview,
  actionUpdateApplication,
  actionUpdateInterviewStatus,
} from "@/lib/recruitment/actions";
import { INTERVIEW_KIND_LABELS, INTERVIEW_STATUS_LABELS, RECOMMENDATION_LABELS, STAGE_LABELS, STAGES } from "@/lib/recruitment/constants";
import type {
  ApplicationStage,
  EmailTemplateKind,
  InterviewKind,
  InterviewStatus,
  Recommendation,
  RecruitmentApplication,
  RecruitmentEmailTemplate,
  RecruitmentInterview,
  ScorecardCriterion,
} from "@/lib/recruitment/types";
import { EmailComposer } from "./email-composer";

const inputCls =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]/30";
const btn = "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface-muted)] disabled:opacity-50";

function ErrorLine({ msg }: { msg: string | null }) {
  return msg ? <p role="alert" className="rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-2.5 text-sm text-[var(--color-danger)]">{msg}</p> : null;
}

export function CandidateToolbar({
  app,
  templates,
  criteria,
  interviews,
  branches,
  instruments,
  hasCv,
  convertedHref,
}: {
  app: RecruitmentApplication;
  templates: RecruitmentEmailTemplate[];
  criteria: ScorecardCriterion[];
  interviews: RecruitmentInterview[];
  branches: { id: string; name: string }[];
  instruments: string[];
  hasCv: boolean;
  convertedHref: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<null | "interview" | "evaluate" | "convert" | "anonymize">(null);
  const [composer, setComposer] = useState<{ kind?: EmailTemplateKind } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const locked = !!app.anonymizedAt;

  // Görüşme formu
  const [iv, setIv] = useState({ kind: "interview" as InterviewKind, date: "", time: "14:00", duration: 45, location: "", interviewers: "", notes: "", send: true });
  // Değerlendirme formu
  const [scores, setScores] = useState<Record<string, number>>({});
  const [rec, setRec] = useState<Recommendation>("neutral");
  const [comment, setComment] = useState("");
  const [interviewId, setInterviewId] = useState<string>("");
  // Aktarma formu
  const [cv, setCv] = useState({ target: app.category as "teacher" | "staff", branchId: branches[0]?.id ?? "", instrument: app.instruments[0] ?? instruments[0] ?? "", position: "" });

  const [anonReason, setAnonReason] = useState("");
  const [anonPassword, setAnonPassword] = useState("");
  const close = () => {
    setDialog(null);
    setErr(null);
    setAnonPassword("");
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select
          aria-label="Aşama"
          disabled={locked || pending}
          value={app.stage}
          onChange={(e) =>
            start(async () => {
              const r = await actionChangeStage({ ids: [app.id], stage: e.target.value });
              if (!r.ok) setErr(r.message);
              router.refresh();
            })
          }
          className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm font-medium"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
          ))}
        </select>
        <button type="button" className={btn} disabled={locked} onClick={() => setComposer({ kind: "positive" })}>
          <ThumbsUp className="h-4 w-4 text-[var(--color-success)]" /> Olumlu
        </button>
        <button type="button" className={btn} disabled={locked} onClick={() => setComposer({ kind: "negative" })}>
          <ThumbsDown className="h-4 w-4 text-[var(--color-danger)]" /> Olumsuz
        </button>
        <button type="button" className={btn} disabled={locked} onClick={() => setComposer({})}>
          <Mail className="h-4 w-4" /> E-posta
        </button>
        <button type="button" className={btn} disabled={locked} onClick={() => setDialog("interview")}>
          <CalendarPlus className="h-4 w-4" /> Görüşme planla
        </button>
        <button type="button" className={btn} disabled={locked} onClick={() => setDialog("evaluate")}>
          <Star className="h-4 w-4" /> Değerlendir
        </button>
        {hasCv ? (
          <a href={`/api/panel/ik/cv/${app.id}`} className={btn}>
            <Download className="h-4 w-4" /> CV
          </a>
        ) : null}
        <a href={`/ik-aday-dokum?ids=${app.id}&detay=1`} target="_blank" rel="noopener" className={btn}>
          <Printer className="h-4 w-4" /> Yazdır
        </a>
        {convertedHref ? (
          <Link href={convertedHref} className={`${btn} border-[var(--color-success)] text-[var(--color-success)]`}>
            <UserPlus className="h-4 w-4" /> Kayda git
          </Link>
        ) : (
          <button type="button" className={`${btn} border-[var(--color-success)]`} disabled={locked} onClick={() => setDialog("convert")}>
            <UserPlus className="h-4 w-4 text-[var(--color-success)]" /> İşe al / aktar
          </button>
        )}
        <button type="button" className={`${btn} text-[var(--color-danger)]`} disabled={locked} onClick={() => setDialog("anonymize")} title="KVKK: kişisel veriyi sil">
          <ShieldOff className="h-4 w-4" />
        </button>
      </div>
      {err ? <div className="mt-2"><ErrorLine msg={err} /></div> : null}

      <EmailComposer
        open={composer !== null}
        onClose={() => setComposer(null)}
        ids={[app.id]}
        templates={templates}
        defaultKind={composer?.kind}
        recipientsLabel={`${app.firstName} ${app.lastName}`}
      />

      <ModalShell
        open={dialog === "interview"}
        onClose={close}
        busy={pending}
        title="Görüşme / deneme dersi planla"
        footer={
          <button
            type="button"
            disabled={pending || !iv.date}
            onClick={() =>
              start(async () => {
                const scheduledAt = new Date(`${iv.date}T${iv.time}:00+03:00`).toISOString();
                const r = await actionScheduleInterview({
                  applicationId: app.id, kind: iv.kind, scheduledAt, durationMinutes: iv.duration, location: iv.location,
                  interviewers: iv.interviewers, notes: iv.notes, sendInvitation: iv.send,
                });
                if (!r.ok) return setErr(r.message);
                close();
                if (r.data.invitation) alert(`Davet e-postası: ${r.data.invitation}`);
                router.refresh();
              })
            }
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Kaydediliyor…" : "Planla"}
          </button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Tür</span>
            <select className={inputCls} value={iv.kind} onChange={(e) => setIv({ ...iv, kind: e.target.value as InterviewKind })}>
              {(Object.keys(INTERVIEW_KIND_LABELS) as InterviewKind[]).map((k) => <option key={k} value={k}>{INTERVIEW_KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="text-sm"><span className="mb-1 block font-medium">Tarih</span><input type="date" className={inputCls} value={iv.date} onChange={(e) => setIv({ ...iv, date: e.target.value })} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Saat</span><input type="time" className={inputCls} value={iv.time} onChange={(e) => setIv({ ...iv, time: e.target.value })} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Süre (dk)</span><input type="number" min={10} max={480} className={inputCls} value={iv.duration} onChange={(e) => setIv({ ...iv, duration: Number(e.target.value) || 30 })} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Görüşmeciler</span><input className={inputCls} value={iv.interviewers} onChange={(e) => setIv({ ...iv, interviewers: e.target.value })} placeholder="örn. Ayşe Hanım, Mehmet Bey" /></label>
          <label className="text-sm sm:col-span-2"><span className="mb-1 block font-medium">Yer / bağlantı</span><input className={inputCls} value={iv.location} onChange={(e) => setIv({ ...iv, location: e.target.value })} placeholder="Şube adresi veya Zoom/Meet bağlantısı" /></label>
          <label className="text-sm sm:col-span-2"><span className="mb-1 block font-medium">İç not</span><textarea rows={2} className={inputCls} value={iv.notes} onChange={(e) => setIv({ ...iv, notes: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={iv.send} onChange={(e) => setIv({ ...iv, send: e.target.checked })} /> Adaya davet e-postası gönder (&quot;Görüşme daveti&quot; şablonu)
          </label>
        </div>
        <div className="mt-3"><ErrorLine msg={err} /></div>
      </ModalShell>

      <ModalShell
        open={dialog === "evaluate"}
        onClose={close}
        busy={pending}
        title="Değerlendirme puan kartı"
        footer={
          <button
            type="button"
            disabled={pending || Object.keys(scores).length === 0}
            onClick={() =>
              start(async () => {
                const r = await actionAddEvaluation({ applicationId: app.id, interviewId: interviewId || null, scores, recommendation: rec, comment });
                if (!r.ok) return setErr(r.message);
                setScores({});
                setComment("");
                close();
                router.refresh();
              })
            }
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Kaydet
          </button>
        }
      >
        <div className="space-y-3">
          {interviews.length ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">İlgili görüşme (opsiyonel)</span>
              <select className={inputCls} value={interviewId} onChange={(e) => setInterviewId(e.target.value)}>
                <option value="">—</option>
                {interviews.map((i) => (
                  <option key={i.id} value={i.id}>
                    {INTERVIEW_KIND_LABELS[i.kind]} · {new Date(i.scheduledAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" })}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {criteria.map((c) => (
            <div key={c.key} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">{c.label}</span>
              <div className="flex gap-1" role="radiogroup" aria-label={c.label}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={scores[c.key] === n}
                    onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}
                    className={`h-8 w-8 rounded-full border text-sm font-medium ${scores[c.key] === n ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white" : "border-[var(--color-border-strong)]"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Öneri</span>
            <select className={inputCls} value={rec} onChange={(e) => setRec(e.target.value as Recommendation)}>
              {(Object.keys(RECOMMENDATION_LABELS) as Recommendation[]).map((r) => <option key={r} value={r}>{RECOMMENDATION_LABELS[r]}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Yorum</span>
            <textarea rows={3} className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <ErrorLine msg={err} />
        </div>
      </ModalShell>

      <ModalShell
        open={dialog === "convert"}
        onClose={close}
        busy={pending}
        title="İşe al — kayıt oluştur"
        footer={
          <button
            type="button"
            disabled={pending || !cv.branchId}
            onClick={() =>
              start(async () => {
                const r = await actionConvertToEmployee({ applicationId: app.id, target: cv.target, branchId: cv.branchId, instrument: cv.instrument || undefined, position: cv.position || undefined });
                if (!r.ok) return setErr(r.message);
                close();
                router.push(r.data.href);
              })
            }
            className="rounded-[var(--radius-md)] bg-[var(--color-success)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Oluşturuluyor…" : "Kaydı oluştur"}
          </button>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-[color:var(--text-secondary)]">
            Adayın ad, e-posta, telefon ve eğitim bilgileriyle yeni bir kayıt açılır; aday &quot;İşe alındı&quot; aşamasına geçer. Maaş, sözleşme, müsaitlik gibi ayrıntıları açılan kayıttan tamamlayın.
          </p>
          <div className="flex gap-2">
            {(["teacher", "staff"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setCv({ ...cv, target: t })} className={`rounded-full border px-3 py-1 ${cv.target === t ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border-strong)]"}`}>
                {t === "teacher" ? "Öğretmen kaydı" : "Personel kaydı"}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block font-medium">Şube</span>
            <select className={inputCls} value={cv.branchId} onChange={(e) => setCv({ ...cv, branchId: e.target.value })}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          {cv.target === "teacher" ? (
            <label className="block">
              <span className="mb-1 block font-medium">Ana enstrüman</span>
              <select className={inputCls} value={cv.instrument} onChange={(e) => setCv({ ...cv, instrument: e.target.value })}>
                {Array.from(new Set([...app.instruments.filter((i) => instruments.some((x) => x.toLocaleLowerCase("tr") === i.toLocaleLowerCase("tr"))), ...instruments])).map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-[var(--color-text-muted)]">Kurumunuzun enstrüman kataloğundaki etkin enstrümanlar listelenir.</span>
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block font-medium">Pozisyon</span>
              <input className={inputCls} value={cv.position} onChange={(e) => setCv({ ...cv, position: e.target.value })} placeholder="örn. Danışma görevlisi" />
            </label>
          )}
          <ErrorLine msg={err} />
        </div>
      </ModalShell>

      <ModalShell
        open={dialog === "anonymize"}
        onClose={close}
        busy={pending}
        tone="danger"
        title="Kişisel veriyi sil (anonimleştir)"
        footer={
          <button
            type="button"
            disabled={pending || anonReason.trim().length < 5 || anonPassword.length === 0}
            onClick={() =>
              start(async () => {
                const r = await actionAnonymizeApplication({ id: app.id, reason: anonReason, criticalPassword: anonPassword });
                setAnonPassword("");
                if (!r.ok) return setErr(r.message);
                close();
                router.push("/panel/ik/adaylar");
              })
            }
            className="rounded-[var(--radius-md)] bg-[var(--color-danger)] px-4 py-2 text-sm font-medium text-white"
          >
            Kalıcı olarak anonimleştir
          </button>
        }
      >
        <p className="text-sm">
          Adayın adı, iletişim bilgileri, CV dosyası, notları ve profil ayrıntıları <strong>kalıcı olarak</strong> silinir; yalnız istatistik (aşama, kaynak, tarih) kalır. KVKK kapsamında aday talep ettiğinde veya saklama süresi dolduğunda kullanın. Bu işlem geri alınamaz.
        </p>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-medium">Gerekçe (en az 5 karakter; adayın kişisel verisini yazmayın)</span>
          <textarea className={inputCls} rows={2} maxLength={500} value={anonReason} onChange={(e) => setAnonReason(e.target.value)} placeholder="Örn. KVKK silme talebi, dilekçe no 12" />
        </label>
        <label className="mt-2 block text-sm">
          <span className="mb-1 block font-medium">Kritik işlem şifresi</span>
          <input type="password" autoComplete="off" className={inputCls} value={anonPassword} onChange={(e) => setAnonPassword(e.target.value)} />
        </label>
        <div className="mt-3"><ErrorLine msg={err} /></div>
      </ModalShell>
    </>
  );
}

export function NoteComposer({ id, disabled }: { id: string; disabled?: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2 print:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await actionAddNote({ id, body });
          if (!r.ok) return setErr(r.message);
          setBody("");
          setErr(null);
          router.refresh();
        });
      }}
    >
      <textarea rows={2} disabled={disabled} className={inputCls} placeholder="Not ekleyin (yalnız yöneticiler görür)…" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex items-center justify-between gap-2">
        <ErrorLine msg={err} />
        <button type="submit" disabled={pending || !body.trim() || disabled} className="ml-auto rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          Not ekle
        </button>
      </div>
    </form>
  );
}

export function TagEditor({ app }: { app: RecruitmentApplication }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const save = (tags: string[]) =>
    start(async () => {
      await actionUpdateApplication({ id: app.id, tags });
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {app.tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs">
          #{t}
          <button type="button" aria-label={`${t} etiketini kaldır`} disabled={pending || !!app.anonymizedAt} onClick={() => save(app.tags.filter((x) => x !== t))} className="print:hidden">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {!app.anonymizedAt ? (
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              e.preventDefault();
              save([...app.tags, value.trim().replace(/^#/, "")]);
              setValue("");
            }
          }}
          placeholder="+ etiket (Enter)"
          className="w-28 rounded-full border border-dashed border-[var(--color-border-strong)] bg-transparent px-2 py-0.5 text-xs outline-none print:hidden"
        />
      ) : null}
    </div>
  );
}

export function InterviewStatusSelect({ interview }: { interview: RecruitmentInterview }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Görüşme durumu"
      disabled={pending}
      value={interview.status}
      onChange={(e) =>
        start(async () => {
          await actionUpdateInterviewStatus({ id: interview.id, status: e.target.value });
          router.refresh();
        })
      }
      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-xs print:hidden"
    >
      {(Object.keys(INTERVIEW_STATUS_LABELS) as InterviewStatus[]).map((s) => <option key={s} value={s}>{INTERVIEW_STATUS_LABELS[s]}</option>)}
    </select>
  );
}

export type { ApplicationStage };
