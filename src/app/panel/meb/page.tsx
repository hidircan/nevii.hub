/**
 * MEB Paneli — alt ekranların giriş kapısı. Bugün tek canlı bölüm var
 * (Öğrenci Listesi); yeni alanlar buraya kart olarak eklenir. Yalnız
 * SCHOOL_ADMIN/SUPER_ADMIN görebilir (tool katmanında da kontrol edilir).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, CalendarDays, ClipboardList, Users } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { listMebStudentsTool } from "@/lib/services/tools";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { Badge, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const UPCOMING = [
  {
    icon: CalendarDays,
    title: "Sınav Planlama",
    description: "MEB sınav tarihlerinin takvimi ve hatırlatmaları burada olacak.",
  },
  {
    icon: ClipboardList,
    title: "Dönem Raporları",
    description: "Seviye dönemlerinin özeti ve çıktıları burada olacak.",
  },
];

export default async function MebHubPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/meb");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }
  const kurum = await getInstitutionContext(session);
  if (kurum.scope.mode !== "single") {
    return (
      <div>
        <KurumScopeNote scope={kurum.scope} />
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">
          MEB Paneli tek kurum görünümünde çalışır — yukarıdan bir kurum seçin.
        </p>
      </div>
    );
  }

  // Canlı sayaçlar (ucuz count sorguları — satır çekilmez).
  const [all, passive] = await Promise.all([
    listMebStudentsTool(session, { active: "all", page: 1, pageSize: 1 }),
    listMebStudentsTool(session, { active: "passive", page: 1, pageSize: 1 }),
  ]);
  const total = all.ok ? all.data.total : 0;
  const passiveCount = passive.ok ? passive.data.total : 0;

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <PageHeader title="MEB Paneli" description="MEB öğrencileriyle ilgili bölümler." />

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/panel/meb/ogrenciler"
          className="block rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] md:col-span-2"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] p-2 text-[var(--color-primary)]">
              <Users className="h-5 w-5" aria-hidden />
            </div>
            <Badge>
              <span className="inline-flex items-center gap-1">
                <Award className="h-3.5 w-3.5" aria-hidden />
                Canlı
              </span>
            </Badge>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-[var(--color-text)]">MEB Öğrenci Listesi</h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
            Yalnız MEB öğrencilerinin tablosu. Seviye, dönem tarihleri ve sınav bilgileri düzenlenir.
          </p>
          <p className="mt-3 text-sm text-[var(--color-text)]">
            <span className="text-2xl font-semibold tracking-tight">Toplam {total}</span>
            <span className="ml-2 text-[var(--color-text-muted)]">
              {passiveCount > 0 ? `${passiveCount} pasif` : "kayıt"}
            </span>
          </p>
          <span className="mt-4 inline-block rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white">
            Listeyi Aç
          </span>
        </Link>

        <div className="space-y-4">
          <p className="text-sm font-semibold text-[var(--color-text)]">Sonraki bölümler</p>
          {UPCOMING.map((s) => (
            <Card key={s.title} className="opacity-80">
              <div className="flex items-start justify-between gap-3">
                <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] p-2 text-[var(--color-text-muted)]">
                  <s.icon className="h-5 w-5" aria-hidden />
                </div>
                <Badge>Yakında</Badge>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-[var(--color-text)]">{s.title}</h3>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{s.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
