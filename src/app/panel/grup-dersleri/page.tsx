import Link from "@/components/link";
import { redirect } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { GroupLessonForm } from "@/components/group-lesson-components";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { groupScheduleLabel, listGroupLessons, seatCount } from "@/lib/group-lessons";
import { resolveActiveInstrumentNames } from "@/lib/instrument-catalog";
import { readReferenceData } from "@/lib/store";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "@/lib/timezone";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 2026-10-23 — Grup dersleri: kontenjanlı, normal ders planlamanın grup varyantı (kulüpten ayrı). Katılım öğrencinin
 * branş kaydıdır; ücret/sözleşme/tahakkuk bireysel kayıtla aynı yürür.
 */
export default async function GrupDersleriPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/grup-dersleri");
  }
  const kurum = await getInstitutionContext(session);
  if (kurum.scope.mode !== "single" || kurum.scope.tenantId !== session.tenantId) {
    return (
      <div>
        <KurumScopeNote scope={kurum.scope} />
        <PageHeader title="Grup Dersleri" />
        <EmptyState title="Kendi kurumunuzu seçin" description="Grup dersleri kurum bazındadır. Üstteki kurum seçiciden kendi kurumunuzu seçin." />
      </div>
    );
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    return (
      <div>
        <PageHeader title="Grup Dersleri" />
        <EmptyState title="Bu ekrana erişiminiz yok" description="Grup derslerini yalnız kurum yöneticileri yönetebilir." />
      </div>
    );
  }
  const [groups, data, instruments] = await Promise.all([listGroupLessons(session.tenantId), readReferenceData(), resolveActiveInstrumentNames(session.tenantId)]);
  const today = toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE);
  const teacherName = (id: string) => data.teachers.find((t) => t.id === id)?.name ?? "—";
  const roomName = (id: string) => data.rooms.find((r) => r.id === id)?.name ?? "—";
  const branchShort = (id: string) => data.settings.branches.find((b) => b.id === id)?.shortName;
  const active = groups.filter((g) => g.status === "active");

  return (
    <div className="space-y-5">
      <PageHeader title="Grup Dersleri" description={`${active.length} aktif grup · aynı öğretmen ve branşta kontenjanlı ders; ders programında tek kart olarak görünür.`} />
      <Card>
        <h2 className="mb-3 text-sm font-semibold">Yeni grup dersi</h2>
        <GroupLessonForm
          instruments={instruments}
          teachers={data.teachers.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, instruments: [...t.instruments] }))}
          rooms={data.rooms.filter((r) => r.active !== false && !r.deletedAt).map((r) => ({ id: r.id, name: r.name, branchName: branchShort(r.branchId) }))}
        />
      </Card>
      {groups.length === 0 ? (
        <EmptyState title="Henüz grup dersi yok" description="Yukarıdan ilk grup dersini oluşturun; ardından mevcut veya yeni öğrencileri ekleyin." />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {groups.map((g) => {
              const seats = seatCount(data.students, g.id, today);
              return (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <Link href={`/panel/grup-dersleri/${g.id}`} className="text-sm font-semibold text-[var(--color-text)] hover:text-[var(--color-primary)]">
                      {g.name}
                    </Link>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {g.instrument} · {teacherName(g.teacherId)} · {roomName(g.roomId)} · {groupScheduleLabel(g)}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-semibold text-[var(--color-text)]">
                      {seats}/{g.capacity} öğrenci{g.status === "ended" ? " · Sona erdi" : seats >= g.capacity ? " · Dolu" : ""}
                    </p>
                    <p className="text-[var(--color-text-muted)]">Öğrenci başı {formatMoney(g.monthlyFee)}/ay</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
