import { redirect } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { TermWeeklyScheduleEditor } from "@/components/term-weekly-schedule-editor";
import { WorkDaysManager } from "@/components/work-days-manager";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import {
  FALL_WEEKLY_CLOSED_DAYS,
  SUMMER_WEEKLY_CLOSED_DAYS,
  resolveWorkDay,
} from "@/lib/work-days";
import { formatDateTr } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/**
 * Çalışma Günleri — kurumun "bu gün açık mı?" kuralının TEK yönetim ekranı.
 *
 * Üç katman burada, aynı sayfada, öncelik sırasıyla görünür:
 *   1) Gün istisnaları (zorla aç / zorla kapat) — en yüksek öncelik
 *   2) Resmî tatiller — otomatik, Diyanet doğrulamalı tablodan
 *   3) Dönemin haftalık kapalı günü — aşağıdaki düzenleyici
 * Ders Programı, seri planlama, ödeme önizlemesi, Yoklama Takvimi ve ders
 * oluşturma doğrulaması aynı çözümleyiciyi (`src/lib/work-days.ts`) kullanır.
 */
export default async function WorkDaysSettingsPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ayarlar/calisma-gunleri");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const overrides = data.closedDayOverrides ?? [];

  // Önümüzdeki 60 günün çözümlenmiş hali — kuralın gerçek sonucunu göstermek
  // için; kullanıcı "acaba hangi günler kapalı?" diye tahmin etmek zorunda kalmaz.
  const today = new Date();
  const upcoming = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i, 9, 0, 0));
    return resolveWorkDay(d, "guz", overrides, data.settings.termWeeklyClosedDays);
  }).filter((d) => d.status === "closed" || d.reason === "manual_open");

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <div className="mb-3">
        <BackButton fallbackHref="/panel/kurulum" label="Kuruluma dön" />
      </div>
      <PageHeader
        title="Çalışma Günleri"
        description="Kurumun hangi günlerde ders yaptığının tek kaynağı — planlama, yoklama ve ücret önizlemesi buradan beslenir."
      />

      <div className="space-y-6">
        <WorkDaysManager
          overrides={overrides.map((o) => ({ id: o.id, date: o.date, name: o.name, isOpen: o.isOpen }))}
          termWeeklyClosedDays={data.settings.termWeeklyClosedDays}
        />

        <TermWeeklyScheduleEditor
          initialGuz={data.settings.termWeeklyClosedDays?.guz ?? FALL_WEEKLY_CLOSED_DAYS}
          initialYaz={data.settings.termWeeklyClosedDays?.yaz ?? SUMMER_WEEKLY_CLOSED_DAYS}
        />

        <Card>
          <h2 className="font-semibold text-[var(--color-text)]">Önümüzdeki 60 gün (Güz dönemi kuralıyla)</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Kuralların birleşik sonucu. Ders Programı bu listedeki kapalı günleri sütun olarak
            göstermez; ders oluşturma da reddeder.
          </p>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              Önümüzdeki 60 günde kapalı gün veya istisna yok.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              {upcoming.map((d) => (
                <li key={d.date} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="font-medium text-[var(--color-text)]">{formatDateTr(`${d.date}T09:00:00Z`)}</span>
                  <span className="text-[var(--color-text-muted)]">{d.explanation}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={
                      d.schedulable
                        ? { background: "var(--color-success-soft)", color: "var(--color-success)" }
                        : { background: "var(--color-danger-soft)", color: "var(--color-danger)" }
                    }
                  >
                    {d.schedulable ? "Ders planlanabilir" : "Ders planlanamaz"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
