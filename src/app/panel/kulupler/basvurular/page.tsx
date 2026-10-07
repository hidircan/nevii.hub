import Link from "@/components/link";
import { redirect } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { listClubsTool } from "@/lib/clubs";
import { CLUB_APPLICATION_STATUSES, CLUB_APPLICATION_STATUS_LABEL, formatPhone, listClubApplicationsTool, type ClubApplicationStatus } from "@/lib/club-applications";
import { ClubApplicationStatusBadge } from "@/components/club-application-status-badge";
import { readReferenceData } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SP = { clubId?: string; branchId?: string; status?: string; from?: string; to?: string; q?: string; page?: string };

/** 2026-10-07 — Kulüpler → Başvurular: grup dersi başvuruları (filtre, arama, sayfalama). Yalnız kurum yöneticileri. */
export default async function KulupBasvurularPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/kulupler/basvurular");
  }
  const kurum = await getInstitutionContext(session);
  if (kurum.scope.mode !== "single" || kurum.scope.tenantId !== session.tenantId) {
    return (
      <div>
        <KurumScopeNote scope={kurum.scope} />
        <PageHeader title="Grup dersi başvuruları" />
        <EmptyState title="Kendi kurumunuzu seçin" description="Başvurular kurum bazındadır. Üstteki kurum seçiciden kendi kurumunuzu seçin." />
      </div>
    );
  }
  const status = CLUB_APPLICATION_STATUSES.includes(sp.status as ClubApplicationStatus) ? (sp.status as ClubApplicationStatus) : undefined;
  const ymd = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const filters = {
    clubId: sp.clubId || undefined,
    branchId: sp.branchId || undefined,
    status,
    from: ymd(sp.from),
    to: ymd(sp.to),
    q: sp.q?.trim() || undefined,
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 20,
  };
  const [result, clubsRes, ref] = await Promise.all([listClubApplicationsTool(session, filters), listClubsTool(session), readReferenceData()]);
  if (!result.ok || !clubsRes.ok) {
    return (
      <div>
        <PageHeader title="Grup dersi başvuruları" />
        <EmptyState title="Bu ekrana erişiminiz yok" description={!result.ok ? result.error.message : "Başvuruları yalnız kurum yöneticileri görebilir."} />
      </div>
    );
  }
  const { items, total, page, pageSize } = result.data;
  const clubs = clubsRes.data.clubs;
  const branches = ref.settings.branches.map((b) => ({ id: b.id, name: b.shortName || b.name }));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, page: String(p), pageSize: undefined })) if (v) u.set(k, String(v));
    return `?${u.toString()}`;
  };
  const control = "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm";
  const anyFilter = !!(filters.clubId || filters.branchId || filters.status || filters.from || filters.to || filters.q);

  return (
    <div className="space-y-5">
      <Link href="/panel/kulupler" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">← Kulüpler</Link>
      <PageHeader title="Grup dersi başvuruları" description={`${total} başvuru${anyFilter ? " (filtreli)" : ""} · başvuru kesin kayıt değildir; ücret/borç oluşturmaz.`} />
      <form method="get" className="grid gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:grid-cols-3 lg:grid-cols-7" aria-label="Başvuru filtreleri">
        <input name="q" defaultValue={filters.q} placeholder="Ad, veli, telefon, referans" aria-label="Ara" className={`${control} lg:col-span-2`} />
        <select name="clubId" defaultValue={filters.clubId ?? ""} aria-label="Kulüp" className={control}>
          <option value="">Tüm kulüpler</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="branchId" defaultValue={filters.branchId ?? ""} aria-label="Şube" className={control}>
          <option value="">Tüm şubeler</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={filters.status ?? ""} aria-label="Durum" className={control}>
          <option value="">Tüm durumlar</option>
          {CLUB_APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>{CLUB_APPLICATION_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2 lg:col-span-2">
          <input type="date" name="from" defaultValue={filters.from} aria-label="Başlangıç tarihi" className={control} />
          <input type="date" name="to" defaultValue={filters.to} aria-label="Bitiş tarihi" className={control} />
        </div>
        <div className="flex items-center gap-3 sm:col-span-3 lg:col-span-7">
          <button type="submit" className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-inverted)]">Filtrele</button>
          {anyFilter ? <Link href="/panel/kulupler/basvurular" className="text-xs text-[var(--color-text-muted)] hover:underline">Filtreleri temizle</Link> : null}
        </div>
      </form>

      {items.length === 0 ? (
        <EmptyState title={anyFilter ? "Filtrelere uyan başvuru yok" : "Henüz başvuru yok"} description={anyFilter ? "Filtreleri gevşetin veya temizleyin." : "Portal bağlantısını Kulüpler ekranından paylaştığınızda başvurular burada görünür."} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2 font-medium">Tarih</th>
                <th className="px-3 py-2 font-medium">Katılımcı</th>
                <th className="px-3 py-2 font-medium">Kulüp</th>
                <th className="px-3 py-2 font-medium">Şube</th>
                <th className="px-3 py-2 font-medium">Telefon</th>
                <th className="px-3 py-2 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {items.map((a) => (
                <tr key={a.id} className="hover:bg-[var(--color-surface-muted)]">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--color-text-muted)]">
                    {formatDateTime(a.createdAt)}
                    <span className="block font-mono text-[11px]">{a.reference}</span>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/panel/kulupler/basvurular/${a.id}`} className="font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]">
                      {a.participantName}
                    </Link>
                    {a.parentName ? <span className="block text-xs text-[var(--color-text-muted)]">Veli: {a.parentName}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    {a.clubSnapshot.name}
                    {a.waitlistRequested ? <span className="block text-[11px] text-[var(--color-warning)]">doluyken başvurdu</span> : null}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text-muted)]">{a.clubSnapshot.branchName ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatPhone(a.phone)}</td>
                  <td className="px-3 py-2">
                    <ClubApplicationStatusBadge status={a.status} />
                    {a.solfegePending ? <span className="block text-[11px] text-[var(--color-warning)]">dahil solfej bekliyor</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <nav aria-label="Sayfalar" className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={qs(page - 1)} className="font-medium text-[var(--color-primary)] hover:underline">← Önceki</Link> : <span />}
          <span className="text-[var(--color-text-muted)]">Sayfa {page} / {pages}</span>
          {page < pages ? <Link href={qs(page + 1)} className="font-medium text-[var(--color-primary)] hover:underline">Sonraki →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
