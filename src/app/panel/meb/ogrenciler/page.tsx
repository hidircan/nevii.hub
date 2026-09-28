/**
 * MEB Paneli › Öğrenci Listesi alt ekranı — yalnız MEB öğrencilerinin
 * tablosu + bu alanların revizyonu. Yalnız SCHOOL_ADMIN/SUPER_ADMIN görebilir
 * (öğretmen/öğrenci/veli asla) — hem burada hem tool katmanında
 * (defense-in-depth) kontrol edilir. Tek kurum görünümü gerekir.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { listMebStudentsTool } from "@/lib/services/tools";
import { resolveActiveInstrumentNames } from "@/lib/instrument-catalog";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { PageHeader } from "@/components/ui";
import { MebPanelTable, type MebPageQuery } from "@/components/meb-panel-table";

export const dynamic = "force-dynamic";

export default async function MebOgrencilerPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sube?: string;
    ogretmen?: string;
    enstruman?: string;
    durum?: string;
    sinav?: string;
    siralama?: string;
    yon?: string;
    sayfa?: string;
    sayfaBoyutu?: string;
  }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/meb/ogrenciler");
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

  const sp = await searchParams;
  const pageSizeRaw = Number(sp.sayfaBoyutu);
  const query: MebPageQuery = {
    q: sp.q || undefined,
    branchId: sp.sube || undefined,
    teacherId: sp.ogretmen || undefined,
    instrument: sp.enstruman || undefined,
    active: sp.durum === "passive" ? "passive" : sp.durum === "all" ? "all" : "active",
    examStatus:
      sp.sinav === "unknown" || sp.sinav === "not_attended" || sp.sinav === "attended" ? sp.sinav : undefined,
    sort:
      sp.siralama === "level" ||
      sp.siralama === "mebLevelStartDate" ||
      sp.siralama === "mebLevelEndDate" ||
      sp.siralama === "mebExamDate"
        ? sp.siralama
        : "name",
    sortDir: sp.yon === "desc" ? "desc" : "asc",
    page: sp.sayfa ? Number(sp.sayfa) || 1 : 1,
    pageSize: pageSizeRaw === 50 || pageSizeRaw === 100 ? pageSizeRaw : 20,
  };

  const [result, data, instruments] = await Promise.all([
    listMebStudentsTool(session, {
      search: query.q,
      branchId: query.branchId,
      teacherId: query.teacherId,
      instrument: query.instrument,
      active: query.active,
      examStatus: query.examStatus,
      sort: query.sort,
      sortDir: query.sortDir,
      page: query.page,
      pageSize: query.pageSize,
    }),
    readScopedData(kurum.scope),
    resolveActiveInstrumentNames(kurum.scope.tenantId),
  ]);

  if (!result.ok) {
    return (
      <div>
        <KurumScopeNote scope={kurum.scope} />
        <p className="mt-4 text-sm text-red-600" role="alert">
          MEB listesi alınamadı: {result.error.message}
        </p>
      </div>
    );
  }

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <PageHeader
        title="MEB Öğrenci Listesi"
        description="Yalnız MEB öğrencileri — seviye, dönem tarihleri ve sınav bilgileri."
        actions={
          <Link
            href="/panel/meb"
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
          >
            MEB Paneli
          </Link>
        }
      />
      <MebPanelTable
        rows={result.data.rows}
        total={result.data.total}
        page={result.data.page}
        pageSize={result.data.pageSize}
        query={query}
        options={{
          branches: data.settings.branches.map((b) => ({ id: b.id, name: b.name })),
          teachers: data.teachers.map((t) => ({ id: t.id, name: t.name })),
          instruments,
        }}
        tenantId={kurum.scope.tenantId}
        userId={session.userId}
      />
    </div>
  );
}
