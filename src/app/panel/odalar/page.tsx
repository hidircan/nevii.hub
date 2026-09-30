import Link from "next/link";
import { readReferenceData } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { Badge, Button, Card, EmptyState, FilterBar, Input, Label, PageHeader, Select } from "@/components/ui";
import { NewRoomForm } from "@/components/new-room-form";
import { RoomArchiveToggle } from "@/components/room-archive-toggle";
import { RoomEditDialog } from "@/components/room-edit-dialog";
import { BackButton } from "@/components/back-button";
import { filterRooms, isRoomFilterActive, parseRoomFilters } from "@/lib/room-filters";

export const dynamic = "force-dynamic";

export default async function OdalarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/odalar");
  }
  const canManage = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  const data = await readReferenceData();
  // Filtreler yalnız görünümü daraltır (GET parametresi) — oda/ders kaydı değişmez.
  // Varsayılan yalnız aktif odalar; pasif odalar yeni ders planlamasında seçilemez
  // (bkz. program-studio.tsx roomOptionsFor). Pasif/Tümü yalnız yöneticiye açık.
  // Silinmiş (soft delete) odalar hiçbir listede görünmez; geçmiş dersler adı korur.
  const parsed = parseRoomFilters(await searchParams);
  const filters = canManage ? parsed : { ...parsed, durum: "aktif" as const };
  const liveRooms = data.rooms.filter((r) => !r.deletedAt);
  const rooms = filterRooms(data.rooms, filters);
  const filtered = isRoomFilterActive(filters);
  const hiddenPassiveCount =
    canManage && filters.durum === "aktif" ? liveRooms.filter((r) => r.active === false).length : 0;
  const branchOptions = data.settings.branches.map((b) => ({ id: b.id, name: b.name }));
  const branchShort = (id: string) => data.settings.branches.find((b) => b.id === id)?.shortName ?? "—";
  const instrumentOptions = [...new Set(liveRooms.flatMap((r) => r.instruments))].sort((a, b) => a.localeCompare(b, "tr"));
  const showStatus = filters.durum !== "aktif";

  return (
    <div>
      <BackButton fallbackHref="/panel/kurulum" label="Kurulum Merkezine dön" className="mb-3" />
      <PageHeader title="Odalar" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <form method="get" action="/panel/odalar">
            <FilterBar resultCount={rooms.length}>
              <div className="w-full sm:w-44">
                <Label>Oda adı</Label>
                <Input name="q" defaultValue={filters.q} placeholder="Örn. Piyano 1" />
              </div>
              <div className="w-full sm:w-44">
                <Label>Şube</Label>
                <Select name="sube" defaultValue={filters.sube}>
                  <option value="">Tüm şubeler</option>
                  {branchOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              {canManage ? (
                <div className="w-full sm:w-32">
                  <Label>Durum</Label>
                  <Select name="durum" defaultValue={filters.durum}>
                    <option value="aktif">Aktif</option>
                    <option value="pasif">Pasif</option>
                    <option value="tumu">Tümü</option>
                  </Select>
                </div>
              ) : null}
              {instrumentOptions.length > 0 ? (
                <div className="w-full sm:w-40">
                  <Label>Enstrüman</Label>
                  <Select name="enstruman" defaultValue={filters.enstruman}>
                    <option value="">Tüm enstrümanlar</option>
                    {instrumentOptions.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <div className="flex items-end gap-2 self-end">
                <Button type="submit">Filtrele</Button>
                {filtered ? (
                  <Link href="/panel/odalar" className="px-1 py-2 text-sm font-medium text-[var(--color-primary)] hover:underline">
                    Filtreleri temizle
                  </Link>
                ) : null}
              </div>
            </FilterBar>
          </form>

          {hiddenPassiveCount > 0 ? (
            <p className="mb-3 text-xs text-[var(--color-text-muted)]">
              {hiddenPassiveCount} pasif oda listede gizli —{" "}
              <Link href="/panel/odalar?durum=pasif" className="font-medium text-[var(--color-primary)] hover:underline">
                pasif odaları göster
              </Link>
              .
            </p>
          ) : null}

          {rooms.length === 0 ? (
            filtered ? (
              <div>
                <EmptyState
                  title="Filtrelere uyan oda yok"
                  description="Şube, durum veya enstrüman seçimini değiştirin ya da filtreleri temizleyin."
                />
                <div className="mt-3 text-center">
                  <Link href="/panel/odalar" className="text-sm font-medium text-[var(--color-primary)] hover:underline">
                    Filtreleri temizle
                  </Link>
                </div>
              </div>
            ) : (
              <EmptyState title="Henüz aktif oda yok." description="Sağdaki formdan yeni oda ekleyebilirsiniz." />
            )
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)] dark:border-slate-800 dark:bg-slate-900/60 dark:text-[var(--color-text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Oda</th>
                    <th className="px-4 py-3">Şube</th>
                    <th className="px-4 py-3">Kapasite</th>
                    <th className="px-4 py-3">Enstrümanlar</th>
                    {showStatus ? <th className="px-4 py-3">Durum</th> : null}
                    {canManage ? <th className="px-4 py-3">İşlem</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => {
                    const active = room.active !== false;
                    return (
                      <tr key={room.id} className="border-b border-slate-50 align-top dark:border-slate-800">
                        <td className="px-4 py-3 font-medium text-[var(--color-text)] dark:text-slate-50">{room.name}</td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                          {branchShort(room.branchId)}
                        </td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{room.capacity}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {room.instruments.map((i) => (
                              <Badge key={i}>{i}</Badge>
                            ))}
                          </div>
                        </td>
                        {showStatus ? (
                          <td className="px-4 py-3 text-[var(--color-text-muted)]">{active ? "Aktif" : "Pasif"}</td>
                        ) : null}
                        {canManage ? (
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-start gap-1.5">
                              <RoomEditDialog room={room} branches={branchOptions} />
                              <RoomArchiveToggle roomId={room.id} roomName={room.name} active={active} />
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <Card>
          <h2 className="mb-4 font-semibold text-[var(--color-text)] dark:text-slate-50">Yeni oda</h2>
          <NewRoomForm branches={branchOptions} />
        </Card>
      </div>
    </div>
  );
}
