import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { readData } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { ownStudents } from "@/lib/teacher-portal-scope";
import { Badge, Card, EmptyState, Input, Pagination, clampPage } from "@/components/ui";
import { effectiveStudentTypes } from "@/lib/student-types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 5;

/**
 * Öğretmenin kendi öğrenci listesi — ana `/ogretmen` panosundaki
 * "Öğrencilerim" bölümünün tam, sayfalanmış hâli. `?q=` isim araması ve
 * `?page=` sayfalaması URL'de tutulur (client JS gerektirmez); arama
 * değişince sayfa her zaman 1'e döner çünkü form GET ile yeni bir
 * navigasyon üretir ve `page` parametresi yeni URL'de yoktur.
 */
export default async function OgretmenOgrencilerPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/ogrenciler");
  }

  const data = await readData();
  const teacherId = session.teacherId || "t2";
  const teacher = data.teachers.find((t) => t.id === teacherId) ?? data.teachers[0];
  if (!teacher) redirect("/login");

  const { q, page: pageRaw } = await searchParams;
  const query = (q ?? "").trim().toLocaleLowerCase("tr");

  const allStudents = ownStudents(data.students, teacher.id)
    .filter((s) => s.active)
    .filter((s) => !query || s.name.toLocaleLowerCase("tr").includes(query))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const totalPages = Math.max(1, Math.ceil(allStudents.length / PAGE_SIZE));
  const page = clampPage(pageRaw, totalPages);
  const pageStudents = allStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function hrefForPage(p: number) {
    const params = new URLSearchParams();
    if (query) params.set("q", q ?? "");
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/ogretmen/ogrenciler?${qs}` : "/ogretmen/ogrenciler";
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto max-w-lg px-4 py-4">
          <Link
            href="/ogretmen"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]"
          >
            <ArrowLeft className="h-4 w-4" /> Geri
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <Users className="h-5 w-5 text-cyan-700" />
            <h1 className="text-xl font-semibold text-[var(--color-text)] dark:text-slate-50">Öğrencilerim</h1>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
            {allStudents.length} aktif öğrenci
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
        <form className="flex gap-2">
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Öğrenci ara…"
            aria-label="Öğrenci ara"
          />
        </form>

        {pageStudents.length === 0 ? (
          <EmptyState
            title={query ? "Aramanızla eşleşen öğrenci yok" : "Aktif öğrenciniz yok"}
            description={query ? `"${q}" için sonuç bulunamadı.` : undefined}
          />
        ) : (
          <div className="space-y-2">
            {pageStudents.map((s) => (
              <Link key={s.id} href={`/ogretmen/ogrenciler/${s.id}`} className="block">
                <Card className="!p-3 transition hover:border-cyan-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)] dark:text-slate-50">{s.name}</p>
                      <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                        {s.instruments.join(", ")} · Veli: {s.parentName}
                      </p>
                      {effectiveStudentTypes(s).length > 0 || s.targetExam ? (
                        <p className="mt-0.5 text-xs text-amber-600">
                          {[effectiveStudentTypes(s).join(", "), s.targetExam].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge>{s.packageName.split("—")[0]?.trim()}</Badge>
                      <span className="text-[11px] font-medium text-cyan-700">Çalışma alanı →</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} hrefForPage={hrefForPage} />
      </main>
    </div>
  );
}
