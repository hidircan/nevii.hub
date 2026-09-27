import { readData } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { NewRoomForm } from "@/components/new-room-form";
import { RoomArchiveToggle } from "@/components/room-archive-toggle";
import { RoomEditDialog } from "@/components/room-edit-dialog";
import { BackButton } from "@/components/back-button";

export const dynamic = "force-dynamic";

export default async function OdalarPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/odalar");
  }
  const canManage = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  const data = await readData();
  // ÖNCELİK 4 (devam) — varsayılan yalnız aktif odalar; pasif odalar ayrı
  // listelenir. Pasif odalar yeni ders planlamasında seçilemez (bkz.
  // program-studio.tsx roomOptionsFor — active!==false filtresi).
  // 8. tur — silinmiş (soft delete) odalar hiçbir listede görünmez; geçmiş dersler adı korur.
  const allRooms = data.rooms.filter((r) => !r.deletedAt).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const rooms = allRooms.filter((r) => r.active !== false);
  const archivedRooms = allRooms.filter((r) => r.active === false);
  const branchOptions = data.settings.branches.map((b) => ({ id: b.id, name: b.name }));

  return (
    <div>
      <BackButton fallbackHref="/panel/kurulum" label="Kurulum Merkezine dön" className="mb-3" />
      <PageHeader title="Odalar" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)] dark:border-slate-800 dark:bg-slate-900/60 dark:text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3">Oda</th>
                <th className="px-4 py-3">Şube</th>
                <th className="px-4 py-3">Kapasite</th>
                <th className="px-4 py-3">Enstrümanlar</th>
                {canManage ? <th className="px-4 py-3">İşlem</th> : null}
              </tr>
            </thead>
            <tbody>
              {rooms.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                    Henüz aktif oda yok.
                  </td>
                </tr>
              ) : (
                rooms.map((room) => (
                  <tr key={room.id} className="border-b border-slate-50 align-top dark:border-slate-800">
                    <td className="px-4 py-3 font-medium text-[var(--color-text)] dark:text-slate-50">{room.name}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                      {data.settings.branches.find((b) => b.id === room.branchId)?.shortName}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{room.capacity}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {room.instruments.map((i) => (
                          <Badge key={i}>{i}</Badge>
                        ))}
                      </div>
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-start gap-1.5">
                          <RoomEditDialog room={room} branches={branchOptions} />
                          <RoomArchiveToggle roomId={room.id} active={room.active !== false} />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-[var(--color-text)] dark:text-slate-50">Yeni oda</h2>
          <NewRoomForm branches={data.settings.branches.map((b) => ({ id: b.id, name: b.name }))} />
        </Card>
      </div>

      {canManage && archivedRooms.length > 0 ? (
        <Card className="mt-6">
          <h2 className="mb-3 font-semibold text-[var(--color-text)] dark:text-slate-50">Pasif Odalar</h2>
          <div className="space-y-2">
            {archivedRooms.map((room) => (
              <div
                key={room.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5 dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-muted)] dark:text-slate-300">{room.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                    {data.settings.branches.find((b) => b.id === room.branchId)?.shortName} · Kapasite {room.capacity}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-1.5">
                  <RoomEditDialog room={room} branches={branchOptions} />
                  <RoomArchiveToggle roomId={room.id} active={false} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
