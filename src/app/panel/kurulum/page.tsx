import Link from "next/link";
import { ArrowRight, BellRing, Building2, CheckCircle2, Circle, DoorOpen, Download, Music, RefreshCcw, Upload } from "lucide-react";
import { actionResetDemo, actionResetToCleanTemplate } from "@/lib/actions";
import { readData } from "@/lib/store";
import { Badge, Card, PageHeader } from "@/components/ui";
import { computeSetupProgress, type SetupStepId } from "@/lib/setup-progress";
import { EXPORT_ENTITIES, type ExportEntity } from "@/lib/export/institution-export";
import { DEFAULT_COLLECTIONS_SETTINGS } from "@/lib/types";
import { CollectionsSettingsForm } from "@/components/collections-settings-form";
import { TermWeeklyScheduleEditor } from "@/components/term-weekly-schedule-editor";
import { FALL_WEEKLY_CLOSED_DAYS, SUMMER_WEEKLY_CLOSED_DAYS } from "@/lib/attendance-calendar";
import { SetupResetAction } from "@/components/setup-reset-action";
import { QuickTaskLink } from "@/components/quick-task-link";

const EXPORT_LABELS: Record<ExportEntity, string> = {
  students: "Öğrenciler",
  teachers: "Öğretmenler",
  lessons: "Dersler",
  attendances: "Yoklamalar",
  payments: "Ödemeler",
  makeupRequests: "Telafi talepleri",
  notifications: "Bildirimler",
  announcements: "Duyurular",
  lessonAssessments: "Gelişim değerlendirmeleri",
  teacherAvailabilityRequests: "Müsaitlik önerileri",
  homework: "Ödevler",
  homeworkSubmissions: "Ödev teslimleri",
  teachingMaterials: "Materyaller",
  teacherFeedback: "Öğretmen geri bildirimleri",
  studentCurriculumTopics: "Müfredat konuları",
  tasks: "İş Takip görevleri",
};

export const dynamic = "force-dynamic";

const STEP_LINKS: Record<SetupStepId, { href: string; doneLabel: string; missingLabel: string }> = {
  school: {
    href: "/panel/subeler",
    doneLabel: "Şubeleri yönet",
    missingLabel: "Şube ekle",
  },
  teachers: {
    href: "/panel/ogretmenler",
    doneLabel: "Öğretmenleri yönet",
    missingLabel: "Öğretmen ekle",
  },
  rooms: {
    href: "/panel/odalar",
    doneLabel: "Odaları yönet",
    missingLabel: "Oda ekle",
  },
  students: {
    href: "/panel/ogrenciler",
    doneLabel: "Öğrencileri yönet",
    missingLabel: "Öğrenci ekle",
  },
  firstLesson: {
    href: "/panel/program",
    doneLabel: "Programı görüntüle",
    missingLabel: "Ders planla",
  },
};

export default async function KurulumPage() {
  const data = await readData();
  const progress = computeSetupProgress(data);

  return (
    <div>
      <PageHeader
        title="Kurulum Merkezi"
        actions={<QuickTaskLink context={{}} returnTo="/panel/kurulum" label="Kurum için görev oluştur" />}
      />

      <Card
        className={
          progress.isReady
            ? "mb-6 border-emerald-200 bg-emerald-50/60"
            : "mb-6 border-amber-200 bg-amber-50/60"
        }
      >
        <p
          className={
            progress.isReady
              ? "text-sm font-semibold text-emerald-800"
              : "text-sm font-semibold text-amber-800"
          }
        >
          {progress.isReady
            ? "Temel kurulum tamamlandı"
            : `${progress.completedCount}/${progress.totalCount} temel adım tamamlandı`}
        </p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
          {progress.isReady
            ? "Okulunuz günlük operasyona hazır. İhtiyaç halinde aşağıdaki ekranlardan yeni kayıt ekleyebilirsiniz."
            : "Aşağıdaki eksik adımları tamamlayarak okulunuzu operasyona hazır hale getirin."}
        </p>
      </Card>

      <Link
        href="/panel/veri-aktar"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700"
      >
        <Upload className="h-4 w-4" /> Verilerinizi topluca aktarın (CSV)
      </Link>

      <div className="grid gap-4 sm:grid-cols-2">
        {progress.steps.map((step) => {
          const link = STEP_LINKS[step.id];
          return (
            <Card key={step.id} className={step.done ? "border-emerald-100" : "border-amber-100"}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  {step.done ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                  )}
                  <div>
                    <p className="font-semibold text-[var(--color-text)] dark:text-slate-50">{step.label}</p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{step.description}</p>
                  </div>
                </div>
                <Badge status={step.done ? "paid" : "pending"}>
                  {step.done ? "Tamamlandı" : "Eksik"}
                </Badge>
              </div>
              <Link
                href={link.href}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700"
              >
                {step.done ? link.doneLabel : link.missingLabel} <ArrowRight className="h-4 w-4" />
              </Link>
            </Card>
          );
        })}

        <Card className={progress.hasPayment ? "border-emerald-100" : "border-[var(--color-border)]"}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              {progress.hasPayment ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-text-muted)]" />
              )}
              <div>
                <p className="font-semibold text-[var(--color-text)] dark:text-slate-50">İlk ödeme (isteğe bağlı)</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                  Tahsilat takibini başlatmak için ilk ödeme kaydını ekleyin. Kurulumun
                  tamamlanması için zorunlu değildir.
                </p>
              </div>
            </div>
            <Badge status={progress.hasPayment ? "paid" : "pending"}>
              {progress.hasPayment ? "Eklendi" : "İsteğe bağlı"}
            </Badge>
          </div>
          <Link
            href="/panel/odemeler"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700"
          >
            İlk tahsilatı ekle <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </div>

      {/* İş 2B — Şubeler/Enstrümanlar/Odalar artık ana sidebar'da değil, kurulum
          altında toplu bir yönetim kartı olarak burada. Route/RBAC AYNEN. */}
      <Card className="mt-6 border-[var(--color-border)]">
        <p className="font-semibold text-[var(--color-text)] dark:text-slate-50">Kurum yapısı</p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Şube, oda ve enstrüman kataloğunu buradan yönetin.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Link href="/panel/subeler">
            <Card className="!p-4 transition hover:border-[var(--color-primary)]">
              <div className="flex items-center gap-2 text-[var(--color-primary)]">
                <Building2 className="h-4 w-4" />
                <p className="text-sm font-semibold">Şubeler</p>
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">Şube listesi ve yönetimi</p>
            </Card>
          </Link>
          <Link href="/panel/odalar">
            <Card className="!p-4 transition hover:border-[var(--color-primary)]">
              <div className="flex items-center gap-2 text-[var(--color-primary)]">
                <DoorOpen className="h-4 w-4" />
                <p className="text-sm font-semibold">Odalar</p>
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">Oda listesi ve kapasite</p>
            </Card>
          </Link>
          <Link href="/panel/enstrumanlar">
            <Card className="!p-4 transition hover:border-[var(--color-primary)]">
              <div className="flex items-center gap-2 text-[var(--color-primary)]">
                <Music className="h-4 w-4" />
                <p className="text-sm font-semibold">Enstrümanlar</p>
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">Enstrüman kataloğu</p>
            </Card>
          </Link>
        </div>
      </Card>

      <Card className="mt-6 border-[var(--color-border)]">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]" />
          <div className="flex-1">
            <p className="font-semibold text-[var(--color-text)] dark:text-slate-50">Veri &amp; Güvenlik</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
              Yalnızca oturum açtığınız kuruma ait kayıtları CSV olarak indirin. Diğer
              kurumların hiçbir kaydı bu dışa aktarıma dahil edilmez. &quot;Tüm kurumlar&quot;
              görünümündeyken dışa aktarım yapılamaz — önce tek bir kurum seçin.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXPORT_ENTITIES.map((entity) => (
                <a
                  key={entity}
                  href={`/api/v1/export?entity=${entity}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Download className="h-3.5 w-3.5" /> {EXPORT_LABELS[entity]} (CSV)
                </a>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="mt-6 border-[var(--color-border)]">
        <div className="flex items-start gap-3">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]" />
          <div className="flex-1">
            <p className="font-semibold text-[var(--color-text)] dark:text-slate-50">Tahsilat Otomasyonu</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
              Gecikmiş ödemeler için taslak mesaj ve veli bildirimi ne sıklıkla hazırlansın?
              Veliler kendi iletişim tercihlerini öğrenci portalından değiştirebilir.
            </p>
            <CollectionsSettingsForm
              frequencyLimitDays={
                data.settings.collectionsSettings?.frequencyLimitDays ??
                DEFAULT_COLLECTIONS_SETTINGS.frequencyLimitDays
              }
              autoSendEnabled={
                data.settings.collectionsSettings?.autoSendEnabled ??
                DEFAULT_COLLECTIONS_SETTINGS.autoSendEnabled
              }
            />
          </div>
        </div>
      </Card>

      <TermWeeklyScheduleEditor
        initialGuz={data.settings.termWeeklyClosedDays?.guz ?? FALL_WEEKLY_CLOSED_DAYS}
        initialYaz={data.settings.termWeeklyClosedDays?.yaz ?? SUMMER_WEEKLY_CLOSED_DAYS}
      />

      <Card className="mt-6 border-[var(--color-border)] bg-[var(--color-surface-muted)]">
        <div className="flex items-start gap-3">
          <RefreshCcw className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]" />
          <div className="flex-1">
            <p className="font-semibold text-[var(--color-text)] dark:text-slate-50">Demo ortamı</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
              Demo verisini sıfırlamak mevcut demo öğretmen/öğrenci/ders/ödeme örneklerini geri
              yükler — sunum ve deneme amaçlıdır. Bu işlem yalnızca yönetici yetkisiyle yapılabilir
              ve geri alınamaz.
            </p>
            <div className="mt-3">
              <SetupResetAction
                action={actionResetDemo}
                triggerLabel="Demo verisini geri yükle"
                triggerVariant="secondary"
                title="Demo verisi geri yüklensin mi?"
                bullets={[
                  "Mevcut tüm öğretmen/öğrenci/ders/ödeme kayıtları silinir.",
                  "Yerine örnek demo verisi (Nilüfer Acar Müzik Akademisi) yüklenir.",
                  "Bu işlem geri alınamaz.",
                ]}
                confirmLabel="Demo verisini geri yükle"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="mt-6 border-rose-200 bg-rose-50/40">
        <div className="flex items-start gap-3">
          <RefreshCcw className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
          <div className="flex-1">
            <p className="font-semibold text-[var(--color-text)] dark:text-slate-50">Boş şablona sıfırla</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
              Demo sıfırlamadan FARKLI bir işlem: hiçbir örnek kayıt bırakmaz, yalnızca kurum
              kimliğinizi (ad, kurulum ayarları) koruyan boş bir kurulum iskeleti bırakır. Gerçek
              operasyona sıfırdan başlamak için kullanın.
            </p>
            <div className="mt-3">
              <SetupResetAction
                action={actionResetToCleanTemplate}
                triggerLabel="Boş şablona sıfırla"
                triggerVariant="danger"
                title="Boş şablona sıfırlansın mı?"
                bullets={[
                  "TÜM öğretmen/öğrenci/şube/oda/ders/ödeme kayıtları kalıcı olarak silinir.",
                  "Demo örnek verisi YENİDEN yüklenmez — kurulum sıfırdan başlar.",
                  "Kurum adı ve genel ayarlar korunur.",
                  "Bu işlem geri alınamaz.",
                ]}
                confirmLabel="Boş şablona sıfırla"
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
