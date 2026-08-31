import { readData } from "@/lib/store";
import { Card, PageHeader } from "@/components/ui";
import { QuickTaskLink } from "@/components/quick-task-link";
import { NewBranchForm } from "@/components/new-branch-form";
import { UpdateBranchForm } from "@/components/update-branch-form";

export const dynamic = "force-dynamic";

export default async function SubelerPage() {
  const data = await readData();
  const branches = [...data.settings.branches].sort((a, b) => a.name.localeCompare(b.name, "tr"));

  return (
    <div>
      <PageHeader
        title="Şubeler"
        description="Okulunuzun tüm fiziksel şubeleri. Şube silme desteklenmez — yanlış girilen bilgiyi düzenleyebilirsiniz."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {branches.length === 0 ? (
            <Card>
              <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Henüz şube eklenmedi.</p>
            </Card>
          ) : (
            branches.map((b) => {
              const teacherCount = data.teachers.filter((t) => t.branchId === b.id && t.active).length;
              const studentCount = data.students.filter((s) => s.branchId === b.id && s.active).length;
              const roomCount = data.rooms.filter((r) => r.branchId === b.id).length;
              return (
                <Card key={b.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[var(--color-text)] dark:text-slate-50">{b.name}</h3>
                      <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                        {b.shortName} · {b.city}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {b.address} · {b.phone}
                      </p>
                      <div className="mt-2">
                        <QuickTaskLink
                          relatedEntityType="branch"
                          relatedEntityId={b.id}
                          relatedEntityLabel={b.name}
                          title={`Şube takibi — ${b.name}`}
                          returnTo="/panel/subeler"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 text-center text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                      <div className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2">
                        <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">{teacherCount}</p>
                        Öğretmen
                      </div>
                      <div className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2">
                        <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">{studentCount}</p>
                        Öğrenci
                      </div>
                      <div className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2">
                        <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">{roomCount}</p>
                        Oda
                      </div>
                    </div>
                  </div>

                  <details className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]/50 p-3">
                    <summary className="cursor-pointer text-sm font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                      Düzenle
                    </summary>
                    <UpdateBranchForm branch={b} />
                  </details>
                </Card>
              );
            })
          )}
        </div>

        <Card>
          <h2 className="mb-4 font-semibold text-[var(--color-text)] dark:text-slate-50">Yeni şube</h2>
          <NewBranchForm />
        </Card>
      </div>
    </div>
  );
}
