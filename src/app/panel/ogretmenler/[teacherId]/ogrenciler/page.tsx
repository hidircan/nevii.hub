import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, Pagination, clampPage } from "@/components/ui";
import { TeacherStudentsArchiveAction } from "@/components/teacher-students-archive-action";
import { loadTeacherPageContext } from "../_context";

export const dynamic = "force-dynamic";

const STUDENTS_PAGE_SIZE = 10;

/** Bu öğretmene atanmış öğrenci listesi. */
export default async function TeacherStudentsTab({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{ sayfa?: string }>;
}) {
  const { teacherId } = await params;
  const { sayfa } = await searchParams;
  const { data, teacher, canManage } = await loadTeacherPageContext(teacherId);
  if (!teacher) notFound();

  const students = data.students
    .filter((s) => s.teacherId === teacher.id)
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const totalPages = Math.max(1, Math.ceil(students.length / STUDENTS_PAGE_SIZE));
  const page = clampPage(sayfa, totalPages);
  const paged = students.slice((page - 1) * STUDENTS_PAGE_SIZE, page * STUDENTS_PAGE_SIZE);

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">
        Öğrenciler {students.length > 0 ? <span className="text-[var(--color-text-muted)]">({students.length})</span> : null}
      </h2>

      {canManage ? (
        <TeacherStudentsArchiveAction
          teacherId={teacher.id}
          teacherName={teacher.name}
          activeStudentCount={students.filter((s) => s.active).length}
        />
      ) : null}

      {students.length === 0 ? (
        <EmptyState title="Atanmış öğrenci yok" />
      ) : (
        <>
          <div className="space-y-2">
            {paged.map((s) => (
              <Link key={s.id} href={`/panel/ogrenciler/${s.id}`}>
                <Card className="!p-3 transition hover:border-[var(--color-primary)]">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{s.name}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {s.instruments.join(", ") || s.packageName.split("—")[0]?.trim() || "—"}
                      </p>
                    </div>
                    <Badge status={s.active ? "confirmed" : "cancelled"}>{s.active ? "Aktif" : "Pasif"}</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            hrefForPage={(p) => `/panel/ogretmenler/${teacher.id}/ogrenciler?sayfa=${p}`}
          />
        </>
      )}
    </div>
  );
}
