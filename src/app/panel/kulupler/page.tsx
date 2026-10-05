import Link from "@/components/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { ClubForm } from "@/components/club-components";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { isMembershipActive, listClubsTool } from "@/lib/clubs";
import { readReferenceData } from "@/lib/store";
import { resolveActiveInstrumentNames } from "@/lib/instrument-catalog";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "@/lib/timezone";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** 2026-10-05 — Kulüpler: grup dersi mantığında, aylık sabit ücretli kulüpler ve üyeleri. */
export default async function KuluplerPage({ searchParams }: { searchParams: Promise<{ yeni?: string }> }) {
  const { yeni } = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/kulupler");
  }
  const kurum = await getInstitutionContext(session);
  // Yazım oturumun kurumuna gider; başka kurum seçiliyken gösterilmez (Notlar ile aynı kural).
  if (kurum.scope.mode !== "single" || kurum.scope.tenantId !== session.tenantId) {
    return (
      <div>
        <KurumScopeNote scope={kurum.scope} />
        <PageHeader title="Kulüpler" />
        <EmptyState title="Kendi kurumunuzu seçin" description="Kulüpler kurum bazındadır. Üstteki kurum seçiciden kendi kurumunuzu seçin." />
      </div>
    );
  }
  const result = await listClubsTool(session);
  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Kulüpler" />
        <EmptyState title="Bu ekrana erişiminiz yok" description={result.error.message} />
      </div>
    );
  }
  const { clubs, memberships } = result.data;
  const data = await readReferenceData();
  const instruments = await resolveActiveInstrumentNames(session.tenantId);
  const today = toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE);
  const teachers = data.teachers.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const branches = data.settings.branches.map((b) => ({ id: b.id, name: b.shortName || b.name }));
  const activeOf = (clubId: string) => memberships.filter((m) => m.clubId === clubId && isMembershipActive(m, today));
  const totals = clubs.reduce(
    (acc, c) => {
      const act = activeOf(c.id);
      return { members: acc.members + act.length, revenue: acc.revenue + act.reduce((s, m) => s + m.monthlyFee, 0) };
    },
    { members: 0, revenue: 0 }
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kulüpler"
        description={`${clubs.filter((c) => c.active).length} aktif kulüp · ${totals.members} aktif üye · aylık ${formatMoney(totals.revenue)} kulüp geliri`}
        actions={
          yeni ? undefined : (
            <Link href="/panel/kulupler?yeni=1" className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-[var(--color-text-inverted)]">
              + Yeni kulüp
            </Link>
          )
        }
      />
      {yeni ? (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Yeni kulüp</p>
            <Link href="/panel/kulupler" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Kapat ✕</Link>
          </div>
          <ClubForm instruments={instruments} branches={branches} teachers={teachers} goToDetail />
        </Card>
      ) : null}
      {clubs.length === 0 ? (
        <EmptyState title="Henüz kulüp yok" description="Ör. Solfej Kulübü: enstrüman, kontenjan, aylık ücret, oturum süresi ve öğretmenleri belirleyerek ilk kulübü oluşturun." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clubs.map((c) => {
            const act = activeOf(c.id);
            const pct = Math.min(100, Math.round((act.length / c.maxMembers) * 100));
            return (
              <Link
                key={c.id}
                href={`/panel/kulupler/${c.id}`}
                className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:border-[var(--color-primary)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--color-text)]">{c.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {c.instrument} · {c.branchId ? (branches.find((b) => b.id === c.branchId)?.name ?? "—") : "Şube bağımsız"} · {c.durationMinutes} dk
                    </p>
                  </div>
                  {!c.active ? (
                    <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-muted)]">Pasif</span>
                  ) : null}
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1 text-[var(--color-text-muted)]">
                      <Users className="h-3.5 w-3.5" aria-hidden="true" /> {act.length}/{c.maxMembers} üye
                    </span>
                    <span className="font-medium tabular-nums">{formatMoney(c.monthlyFee)} / ay</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)]" aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "var(--color-warning)" : "var(--color-primary)" }} />
                  </div>
                </div>
                <p className="mt-3 truncate text-xs text-[var(--color-text-muted)]">
                  Öğretmen: {c.teacherIds.map((id) => data.teachers.find((t) => t.id === id)?.name ?? "—").join(", ")}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  Aylık toplam: <span className="tabular-nums text-[var(--color-text)]">{formatMoney(act.reduce((s, m) => s + m.monthlyFee, 0))}</span>
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
